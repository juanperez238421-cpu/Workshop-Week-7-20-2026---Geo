"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const RESULT_ID_PATTERN = /^[A-Za-z0-9_-]{12,96}$/;

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}

function safeEqual(candidate, expected) {
  const left = Buffer.from(String(candidate || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function firstRealPlayer(report) {
  return (Array.isArray(report?.players) ? report.players : []).find((player) => !player?.isBot) || null;
}

function normalizeStudentRows(report, realPlayer) {
  const direct = Array.isArray(report?.individualStudents) ? report.individualStudents : [];
  if (direct.length) return direct;
  return Array.isArray(realPlayer?.individualStudents) ? realPlayer.individualStudents : [];
}

function summarizeResult(payload, fallbackReceivedAt = Date.now()) {
  const report = payload?.report && typeof payload.report === "object" ? payload.report : payload;
  const realPlayer = firstRealPlayer(report);
  const students = normalizeStudentRows(report, realPlayer);
  const attempts = students.length
    ? students.reduce((sum, row) => sum + (Number(row?.attempts) || 0), 0)
    : Number(realPlayer?.attempts) || 0;
  const correct = students.length
    ? students.reduce((sum, row) => sum + (Number(row?.correct) || 0), 0)
    : Number(realPlayer?.correct) || 0;
  const wrong = students.length
    ? students.reduce((sum, row) => sum + (Number(row?.wrong) || 0), 0)
    : Number(realPlayer?.wrong) || 0;
  const timeouts = students.length
    ? students.reduce((sum, row) => sum + (Number(row?.timeouts) || 0), 0)
    : Number(realPlayer?.timeouts) || 0;
  const teamScore = Array.isArray(report?.teamScores)
    ? report.teamScores.find((row) => Number(row?.team) === Number(realPlayer?.team))
    : null;
  const score = Number(realPlayer?.groupScore ?? teamScore?.score ?? payload?.score);
  const names = students.length
    ? students.map((row) => String(row?.studentName || "")).filter(Boolean)
    : Array.isArray(realPlayer?.students) ? realPlayer.students.map(String) : [];

  return {
    resultId: String(payload?.resultId || ""),
    receivedAt: Number(payload?.receivedAt || fallbackReceivedAt),
    submittedAt: Number(payload?.submittedAt || 0) || null,
    endedAt: Number(report?.endedAt || payload?.endedAt || 0) || null,
    roomCode: String(report?.roomCode || payload?.roomCode || ""),
    channelNumber: Number(report?.channelNumber || payload?.channelNumber || 0) || 0,
    pcLabel: String(realPlayer?.pcLabel || payload?.pcLabel || "Local PC"),
    students: names,
    score: Number.isFinite(score) ? Math.round(score * 100) / 100 : null,
    territory: Number(realPlayer?.territory) || 0,
    kills: Number(realPlayer?.kills) || 0,
    deaths: Number(realPlayer?.deaths) || 0,
    attempts,
    correct,
    wrong,
    timeouts,
    accuracy: attempts ? correct / attempts : null,
    appVersion: String(payload?.appVersion || payload?.desktop?.appVersion || ""),
    deviceId: String(payload?.deviceId || payload?.desktop?.deviceId || ""),
    deviceLabel: String(payload?.deviceLabel || payload?.desktop?.deviceLabel || "")
  };
}

class LocalResultStore {
  constructor({ directory, ingestKey }) {
    this.directory = path.resolve(directory);
    this.ingestKey = String(ingestKey || "");
    fs.mkdirSync(this.directory, { recursive: true });
  }

  get enabled() {
    return this.ingestKey.length >= 12;
  }

  authenticateRequest(req) {
    const header = req.headers["x-triad-report-key"] || "";
    const authorization = String(req.headers.authorization || "");
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    return this.enabled && (safeEqual(header, this.ingestKey) || safeEqual(bearer, this.ingestKey));
  }

  resultPath(resultId) {
    if (!RESULT_ID_PATTERN.test(String(resultId || ""))) throw new Error("Invalid result identifier.");
    return path.join(this.directory, `${resultId}.json`);
  }

  async readRequestBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_REPORT_BYTES) throw Object.assign(new Error("Report payload is too large."), { statusCode: 413 });
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) throw Object.assign(new Error("Report payload is empty."), { statusCode: 400 });
    try {
      return JSON.parse(text);
    } catch {
      throw Object.assign(new Error("Report payload must be valid JSON."), { statusCode: 400 });
    }
  }

  async ingestHttp(req, res) {
    if (!this.enabled) {
      jsonResponse(res, 503, { ok: false, error: "Local result ingestion is not configured on this server." });
      return null;
    }
    if (!this.authenticateRequest(req)) {
      jsonResponse(res, 401, { ok: false, error: "Invalid report delivery key." });
      return null;
    }

    try {
      const payload = await this.readRequestBody(req);
      if (payload?.test === true) {
        jsonResponse(res, 200, { ok: true, test: true, receivedAt: Date.now() });
        return null;
      }

      const generatedId = crypto.createHash("sha256").update(JSON.stringify({
        roomCode: payload?.report?.roomCode || payload?.roomCode,
        endedAt: payload?.report?.endedAt || payload?.endedAt,
        students: firstRealPlayer(payload?.report)?.students || payload?.students,
        deviceId: payload?.deviceId
      })).digest("base64url").slice(0, 32);
      const resultId = RESULT_ID_PATTERN.test(String(payload?.resultId || "")) ? String(payload.resultId) : generatedId;
      const receivedAt = Date.now();
      const stored = { ...payload, resultId, receivedAt, schemaVersion: Number(payload?.schemaVersion) || 1 };
      const target = this.resultPath(resultId);
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
      await fs.promises.rename(temporary, target);
      const summary = summarizeResult(stored, receivedAt);
      jsonResponse(res, 202, { ok: true, duplicate: false, resultId, receivedAt, summary });
      return summary;
    } catch (error) {
      jsonResponse(res, Number(error?.statusCode) || 500, { ok: false, error: error?.message || "Result ingestion failed." });
      return null;
    }
  }

  async listSummaries(limit = 200) {
    const names = (await fs.promises.readdir(this.directory)).filter((name) => name.endsWith(".json"));
    const rows = [];
    for (const name of names.slice(0, 1000)) {
      try {
        const payload = JSON.parse(await fs.promises.readFile(path.join(this.directory, name), "utf8"));
        rows.push(summarizeResult(payload));
      } catch {}
    }
    rows.sort((a, b) => Number(b.receivedAt) - Number(a.receivedAt));
    return rows.slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
  }

  async getResult(resultId) {
    return JSON.parse(await fs.promises.readFile(this.resultPath(resultId), "utf8"));
  }

  async deleteResult(resultId) {
    await fs.promises.unlink(this.resultPath(resultId));
  }
}

module.exports = { LocalResultStore, summarizeResult };
