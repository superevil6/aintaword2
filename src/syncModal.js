// Sync dialog — set up and manage anonymous cross-device history sync.
//
// No accounts, no email, no password. Turning sync on mints a random device
// code (src/core/syncCode.js); linking another device is pasting that code in.
// The code is a bearer capability — whoever holds it can read/write that
// history — so the dialog is upfront about treating it like a password.
//
// Holds no network logic itself: it flips the code in storage and asks
// core/sync.js to start/stop/restart.

import {
  getSyncCode, hasSyncCode, ensureSyncCode, adoptSyncCode, clearSyncCode,
  formatCode, canonicalizeCode, isValidCode,
} from "./core/syncCode.js";
import { startSync, stopSync, restartSync } from "./core/sync.js";
import { copyToClipboard } from "./core/clipboard.js";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/** Open the sync dialog. */
export function openSync() {
  const overlay = document.createElement("div");
  overlay.className = "supporter-overlay";

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);

  render(overlay, close);
  document.body.appendChild(overlay);
}

/** (Re)draw the dialog for the current state, then wire it. */
function render(overlay, close) {
  overlay.innerHTML = hasSyncCode() ? onHtml() : offHtml();
  overlay.querySelector("[data-act='close']").addEventListener("click", close);
  if (hasSyncCode()) wireOn(overlay, close);
  else wireOff(overlay, close);
  overlay.querySelector("button, input, a")?.focus();
}

function offHtml() {
  return `
    <div class="supporter-modal" role="dialog" aria-modal="true" aria-label="Sync across devices">
      <button class="sup-close" type="button" data-act="close" aria-label="Close">✕</button>
      <h2 class="sup-title">Sync across devices</h2>
      <p class="sup-lede">Keep your play history and streaks in step across phone, tablet and desktop. No account, no email — just a private code this device generates.</p>
      <button class="sync-enable" type="button" data-act="enable">Turn on sync</button>
      <p class="sup-legal">The code is like a password: anyone who has it can see and change this history. Nothing else about you is stored.</p>
    </div>`;
}

function onHtml() {
  const code = getSyncCode();
  return `
    <div class="supporter-modal" role="dialog" aria-modal="true" aria-label="Sync settings">
      <button class="sup-close" type="button" data-act="close" aria-label="Close">✕</button>
      <h2 class="sup-title">Sync is on</h2>
      <p class="sup-lede">On another device, turn on sync and enter this code to link them. Keep it private — it's the key to this history.</p>
      <div class="sync-code" role="group" aria-label="Your sync code">
        <code class="sync-code-text">${esc(formatCode(code))}</code>
        <button class="sync-copy" type="button" data-act="copy">Copy</button>
      </div>

      <label class="sync-link-label" for="sync-link-input">Link another device's code</label>
      <form class="sync-link" data-act="link">
        <input class="sup-input" id="sync-link-input" type="text" name="code"
               placeholder="XXXX-XXXX-…" autocomplete="off" spellcheck="false" />
        <button class="sync-link-btn" type="submit">Link</button>
      </form>
      <p class="sync-msg" role="status" aria-live="polite"></p>

      <button class="sync-unlink" type="button" data-act="unlink">Unlink this device</button>
    </div>`;
}

function wireOff(overlay, close) {
  overlay.querySelector("[data-act='enable']").addEventListener("click", () => {
    ensureSyncCode();
    startSync();
    render(overlay, close); // now show the code + link controls
  });
}

function wireOn(overlay, close) {
  const msg = overlay.querySelector(".sync-msg");

  const copyBtn = overlay.querySelector("[data-act='copy']");
  copyBtn.addEventListener("click", async () => {
    const ok = await copyToClipboard(getSyncCode());
    copyBtn.textContent = ok ? "Copied!" : "Copy failed";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1600);
  });

  overlay.querySelector("[data-act='link']").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = overlay.querySelector("#sync-link-input");
    const raw = input.value;
    if (!isValidCode(canonicalizeCode(raw))) {
      msg.textContent = "That doesn't look like a valid code — check for typos.";
      return;
    }
    // Adopt the other device's code and re-sync against it. history.js merges as
    // a union, so linking never loses either device's records.
    adoptSyncCode(raw);
    restartSync();
    msg.textContent = "Linked — your history will merge in a moment.";
    setTimeout(() => render(overlay, close), 1100);
  });

  overlay.querySelector("[data-act='unlink']").addEventListener("click", () => {
    stopSync();
    clearSyncCode();
    render(overlay, close); // back to the off state
  });
}
