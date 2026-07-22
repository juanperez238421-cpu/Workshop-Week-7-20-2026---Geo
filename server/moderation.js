"use strict";

function normalizeForMatching(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function canonicalWord(value) {
  return normalizeForMatching(value).replace(/\s+/g, "");
}

function containsBannedLanguage(value, bannedWords = []) {
  const normalized = normalizeForMatching(value);
  if (!normalized) return false;

  const banned = new Set(
    bannedWords
      .map(canonicalWord)
      .filter(Boolean)
  );
  if (banned.size === 0) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);

  // Direct token matching avoids false positives inside legitimate words such
  // as "computadora", which contains the letters "puta" only incidentally.
  if (tokens.some((token) => banned.has(token))) return true;

  // Catch punctuation/spacing obfuscation such as f.u.c.k, f*ck, p-u-t-a,
  // while only joining short fragments. Normal words are never collapsed.
  const longestBannedWord = Math.max(...[...banned].map((word) => word.length));
  for (let start = 0; start < tokens.length; start += 1) {
    if (tokens[start].length > 2) continue;
    let joined = "";
    for (let end = start; end < tokens.length; end += 1) {
      const fragment = tokens[end];
      if (fragment.length > 2) break;
      joined += fragment;
      if (joined.length > longestBannedWord) break;
      if (banned.has(joined)) return true;
    }
  }

  return false;
}

module.exports = {
  normalizeForMatching,
  containsBannedLanguage
};
