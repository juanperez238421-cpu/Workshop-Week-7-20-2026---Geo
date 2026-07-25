(() => {
  "use strict";

  if (!window.triadDesktop?.isDesktop) return;

  const state = {
    info: null,
    settings: null,
    modal: null,
    status: null,
    badge: null
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));

  function setStatus(message, kind = "neutral") {
    if (!state.status) return;
    state.status.textContent = message;
    state.status.dataset.kind = kind;
  }

  function setDeliveryBadge(mode, text) {
    if (!state.badge) return;
    state.badge.dataset.mode = mode;
    state.badge.textContent = text;
    const finalStatus = document.getElementById("desktopFinalDeliveryStatusV27");
    if (finalStatus) {
      finalStatus.dataset.mode = mode;
      finalStatus.textContent = text;
    }
  }

  function createModal() {
    const section = document.createElement("section");
    section.id = "desktopSettingsOverlayV27";
    section.className = "desktop-settings-overlay-v27";
    section.hidden = true;
    section.innerHTML = `
      <form id="desktopSettingsFormV27" class="desktop-settings-card-v27">
        <div class="desktop-settings-heading-v27">
          <div>
            <span>LOCAL WINDOWS EDITION · V27</span>
            <h2>Teacher result delivery</h2>
            <p>The game and authoritative server run on this computer. Final score and questionnaire data are always saved locally; when internet is available, the app sends the report to the configured teacher inbox immediately.</p>
          </div>
          <button id="desktopSettingsCloseV27" type="button" aria-label="Close settings">×</button>
        </div>
        <div class="desktop-settings-grid-v27">
          <label>Teacher results endpoint
            <input id="desktopEndpointV27" type="url" autocomplete="url" spellcheck="false" placeholder="https://.../api/local-results" />
          </label>
          <label>Delivery access key
            <input id="desktopReportKeyV27" type="password" autocomplete="new-password" spellcheck="false" placeholder="Leave blank to keep the saved key" />
          </label>
          <label>Computer label
            <input id="desktopDeviceLabelV27" type="text" maxlength="80" autocomplete="off" />
          </label>
          <label>Match duration
            <select id="desktopMatchMinutesV27">
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="20">20 minutes</option>
            </select>
          </label>
        </div>
        <label class="desktop-clear-key-v27"><input id="desktopClearKeyV27" type="checkbox" /> Remove the saved delivery key</label>
        <div id="desktopSettingsStatusV27" class="desktop-settings-status-v27" data-kind="neutral">Loading local configuration…</div>
        <div class="desktop-settings-actions-v27">
          <button id="desktopSaveSettingsV27" class="primary-button" type="submit">SAVE SETTINGS</button>
          <button id="desktopTestDeliveryV27" class="secondary-button" type="button">TEST TEACHER DELIVERY</button>
          <button id="desktopRetryOutboxV27" class="secondary-button" type="button">RETRY QUEUED RESULTS</button>
          <button id="desktopOpenResultsV27" class="secondary-button" type="button">OPEN LOCAL RESULTS</button>
        </div>
        <div class="desktop-settings-footer-v27">
          <span id="desktopRuntimeDetailV27">Local engine starting…</span>
          <button id="desktopRestartV27" type="button">RESTART APP</button>
        </div>
      </form>`;
    document.body.appendChild(section);
    state.modal = section;
    state.status = section.querySelector("#desktopSettingsStatusV27");

    section.querySelector("#desktopSettingsCloseV27")?.addEventListener("click", () => closeModal());
    section.addEventListener("mousedown", (event) => { if (event.target === section) closeModal(); });
    section.querySelector("#desktopSettingsFormV27")?.addEventListener("submit", saveSettings);
    section.querySelector("#desktopTestDeliveryV27")?.addEventListener("click", testDelivery);
    section.querySelector("#desktopRetryOutboxV27")?.addEventListener("click", retryOutbox);
    section.querySelector("#desktopOpenResultsV27")?.addEventListener("click", () => window.triadDesktop.openResultsFolder());
    section.querySelector("#desktopRestartV27")?.addEventListener("click", () => window.triadDesktop.restartApp());
    return section;
  }

  function applySettings() {
    const settings = state.settings;
    if (!settings || !state.modal) return;
    state.modal.querySelector("#desktopEndpointV27").value = settings.resultsEndpoint || "";
    state.modal.querySelector("#desktopDeviceLabelV27").value = settings.deviceLabel || "";
    state.modal.querySelector("#desktopMatchMinutesV27").value = String(settings.matchMinutes || 10);
    const keyInput = state.modal.querySelector("#desktopReportKeyV27");
    keyInput.value = "";
    keyInput.placeholder = settings.hasReportKey ? "Saved securely · leave blank to keep" : "Enter the shared report key";
    state.modal.querySelector("#desktopClearKeyV27").checked = false;
    const info = state.info;
    const detail = state.modal.querySelector("#desktopRuntimeDetailV27");
    if (detail) detail.textContent = `Room ${info?.roomCode || "—"} · local server ${info?.serverUrl || "starting"} · ${settings.matchMinutes || 10} min · ${info?.outboxCount || 0} queued`;
    setStatus(settings.hasReportKey
      ? "Local saving and instant teacher delivery are configured."
      : "Local saving is active. Add the shared delivery key to enable instant teacher delivery.", settings.hasReportKey ? "success" : "warning");
  }

  async function openModal() {
    state.modal ||= createModal();
    state.modal.hidden = false;
    document.body.classList.add("desktop-settings-open-v27");
    try {
      [state.info, state.settings] = await Promise.all([window.triadDesktop.getInfo(), window.triadDesktop.getSettings()]);
      applySettings();
    } catch (error) {
      setStatus(error.message || "Unable to read desktop settings.", "error");
    }
  }

  function closeModal() {
    if (state.modal) state.modal.hidden = true;
    document.body.classList.remove("desktop-settings-open-v27");
  }

  async function saveSettings(event) {
    event.preventDefault();
    const button = state.modal.querySelector("#desktopSaveSettingsV27");
    button.disabled = true;
    setStatus("Saving encrypted desktop settings…");
    try {
      state.settings = await window.triadDesktop.saveSettings({
        resultsEndpoint: state.modal.querySelector("#desktopEndpointV27").value,
        reportKey: state.modal.querySelector("#desktopReportKeyV27").value,
        clearReportKey: state.modal.querySelector("#desktopClearKeyV27").checked,
        deviceLabel: state.modal.querySelector("#desktopDeviceLabelV27").value,
        matchMinutes: Number(state.modal.querySelector("#desktopMatchMinutesV27").value)
      });
      applySettings();
      setStatus(state.settings.restartRequiredForMatchDuration
        ? "Settings saved. Restart the app before the next match to apply the new duration."
        : "Settings saved. Future reports will use this teacher delivery configuration.", "success");
    } catch (error) {
      setStatus(error.message || "Settings could not be saved.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function testDelivery() {
    const button = state.modal.querySelector("#desktopTestDeliveryV27");
    button.disabled = true;
    setStatus("Testing the encrypted result-delivery channel…");
    try {
      await window.triadDesktop.testDelivery();
      setStatus("Teacher delivery verified. The server accepted the authenticated test without storing a student result.", "success");
      setDeliveryBadge("sent", "DELIVERY READY");
    } catch (error) {
      setStatus(error.message || "Teacher delivery test failed.", "error");
      setDeliveryBadge("queued", "LOCAL SAVE ONLY");
    } finally {
      button.disabled = false;
    }
  }

  async function retryOutbox() {
    const button = state.modal.querySelector("#desktopRetryOutboxV27");
    button.disabled = true;
    setStatus("Retrying queued result files…");
    try {
      const result = await window.triadDesktop.retryOutbox();
      setStatus(`${result.sent} queued result(s) sent · ${result.remaining} still waiting.`, result.remaining ? "warning" : "success");
      if (!result.remaining) setDeliveryBadge("sent", "RESULTS SYNCHRONIZED");
    } catch (error) {
      setStatus(error.message || "Queued results could not be retried.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function installDesktopChrome() {
    document.body.classList.add("desktop-local-mode-v27");
    const actions = document.querySelector(".topbar-actions");
    if (actions && !document.getElementById("desktopSettingsButtonV27")) {
      const badge = document.createElement("span");
      badge.id = "desktopDeliveryBadgeV27";
      badge.className = "desktop-delivery-badge-v27";
      badge.dataset.mode = "local";
      badge.textContent = "LOCAL SAVE";
      state.badge = badge;
      const button = document.createElement("button");
      button.id = "desktopSettingsButtonV27";
      button.className = "icon-button desktop-settings-button-v27";
      button.type = "button";
      button.textContent = "LOCAL SETTINGS";
      button.addEventListener("click", openModal);
      actions.prepend(button);
      actions.prepend(badge);
    }

    const room = document.getElementById("roomCodeInput");
    if (room) {
      room.readOnly = true;
      room.title = "The local authoritative controller generated this room.";
    }
    const advanced = document.querySelector(".advanced-server");
    if (advanced) advanced.hidden = true;
    const healthTitle = document.getElementById("serverHealthTitle");
    const healthText = document.getElementById("serverHealthText");
    if (healthTitle) healthTitle.textContent = "Local authoritative engine ready";
    if (healthText) healthText.textContent = "Gameplay stays on this PC. Internet is used only for final-result delivery.";
    const lead = document.querySelector("#lobbyOverlay .lead");
    if (lead) lead.textContent = "This Windows edition runs one private local arena with one real PC team and five optimized bots. Enter exactly three student names and press Register. The embedded teacher controller approves and starts the match automatically; no internet connection is required for gameplay.";
    const approval = document.querySelector("#registrationForm .approval-note");
    if (approval) approval.textContent = "One computer represents exactly three students. After registration, the embedded local controller creates five bots and starts the authoritative match automatically.";
    const waitingMessage = document.getElementById("waitingMessage");
    if (waitingMessage) waitingMessage.textContent = "Local controller is preparing the match…";
    const privateNote = document.querySelector(".student-private-report-note-v23");
    if (privateNote) privateNote.innerHTML = "<strong>Your result is saved on this computer immediately.</strong> When teacher delivery is configured and internet is available, the complete score and individual questionnaire record are sent automatically. Failed sends remain in the encrypted local workflow queue for retry.";
    const endModal = document.querySelector("#endOverlay .end-modal");
    if (endModal && !document.getElementById("desktopFinalDeliveryStatusV27")) {
      const status = document.createElement("p");
      status.id = "desktopFinalDeliveryStatusV27";
      status.className = "desktop-final-delivery-v27";
      status.dataset.mode = "local";
      status.textContent = "Final result will be saved locally and delivered to the configured teacher inbox.";
      const returnButton = document.getElementById("returnLobbyButton");
      endModal.insertBefore(status, returnButton || null);
    }
  }

  async function initialize() {
    installDesktopChrome();
    try {
      [state.info, state.settings] = await Promise.all([window.triadDesktop.getInfo(), window.triadDesktop.getSettings()]);
      const clock = document.getElementById("clockLabel");
      if (clock) clock.textContent = `${String(state.settings.matchMinutes || 10).padStart(2, "0")}:00`;
      const durationRule = document.querySelector("#lobbyOverlay .rule-grid > div:nth-child(2) b");
      if (durationRule) durationRule.textContent = `${state.settings.matchMinutes || 10} min`;
      if (state.info.outboxCount > 0) setDeliveryBadge("queued", `${state.info.outboxCount} QUEUED`);
      else if (state.settings.hasReportKey) setDeliveryBadge("ready", "DELIVERY READY");
      else setDeliveryBadge("local", "LOCAL SAVE ONLY");
    } catch {
      setDeliveryBadge("local", "LOCAL SAVE ONLY");
    }
    window.triadDesktop.onDeliveryStatus((payload) => {
      const mode = String(payload?.state || "local");
      const labels = { saved: "SAVED LOCALLY", sent: "SENT TO TEACHER", queued: "QUEUED FOR DELIVERY" };
      setDeliveryBadge(mode, labels[mode] || "LOCAL RESULT");
      const banner = document.getElementById("eventBanner");
      if (banner && payload?.message) {
        banner.textContent = payload.message;
        banner.classList.add("visible");
        setTimeout(() => banner.classList.remove("visible"), 4200);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();

  window.__triadDesktopLocalUiV27 = Object.freeze({ build: "20260725-desktop-local27", openSettings: openModal, escapeHtml });
})();
