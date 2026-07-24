// Supporter modal — the "Become a supporter" flow, self-contained.
//
// Two paths in one dialog:
//   • BUY    → opens the Lemon Squeezy checkout (SUPPORTER_CHECKOUT_URL).
//   • UNLOCK → paste the license key emailed after purchase → POST
//              /api/license/validate → on valid, grant the entitlement locally
//              and store the key. Perks (themes, archive) light up immediately
//              because grant() fires the entitlements change event the shell
//              already listens on.
//
// Supporters are goodwill/cosmetic (see the monetization plan): a valid key
// grants locally and persists; periodic server re-validation is a later step.

import { SUPPORTER_CHECKOUT_URL } from "./config.js";
import { grant, revoke, isSupporter, SKU } from "./core/entitlements.js";

const LICENSE_KEY_STORE = "aintaword2:license";

/** The license key the player unlocked with, for later sync/re-validation. */
export function storedLicenseKey() {
  try {
    return localStorage.getItem(LICENSE_KEY_STORE) || "";
  } catch {
    return "";
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/** Open the supporter dialog. Content depends on whether they already hold it. */
export function openSupporter() {
  const overlay = document.createElement("div");
  overlay.className = "supporter-overlay";
  overlay.innerHTML = isSupporter() ? thanksHtml() : pitchHtml();

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
  overlay.querySelector("[data-act='close']").addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  if (isSupporter()) wireThanks(overlay, close);
  else wirePitch(overlay, close);

  document.body.appendChild(overlay);
  overlay.querySelector("input, a, button").focus();
}

function pitchHtml() {
  const buy = SUPPORTER_CHECKOUT_URL
    ? `<a class="sup-buy" href="${esc(SUPPORTER_CHECKOUT_URL)}" target="_blank" rel="noopener">Become a supporter →</a>`
    : `<p class="sup-soon">Supporter checkout is coming soon — you can still unlock a key below.</p>`;
  return `
    <div class="supporter-modal" role="dialog" aria-modal="true" aria-label="Become a supporter">
      <button class="sup-close" type="button" data-act="close" aria-label="Close">✕</button>
      <h2 class="sup-title">Support Wordems</h2>
      <p class="sup-lede">Wordems is free, and stays free. Supporting it unlocks a little extra:</p>
      <ul class="sup-perks">
        <li>Extra color themes</li>
        <li>The puzzle archive — replay any past day</li>
        <li>Cross-device sync <span class="sup-tag">soon</span></li>
      </ul>
      ${buy}
      <p class="sup-legal">Sold by Lemon Squeezy. By supporting you agree to our
        <a href="/terms/" target="_blank" rel="noopener">Terms</a> &amp;
        <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.</p>
      <div class="sup-divider"><span>already have a key?</span></div>
      <form class="sup-form" data-act="unlock">
        <input class="sup-input" type="text" name="key" placeholder="Paste your license key"
               autocomplete="off" spellcheck="false" />
        <button class="sup-unlock" type="submit">Unlock</button>
      </form>
      <p class="sup-msg" role="status" aria-live="polite"></p>
    </div>`;
}

function thanksHtml() {
  return `
    <div class="supporter-modal" role="dialog" aria-modal="true" aria-label="Supporter">
      <button class="sup-close" type="button" data-act="close" aria-label="Close">✕</button>
      <h2 class="sup-title">You're a supporter ★</h2>
      <p class="sup-lede">Thank you — the extra themes and the archive are unlocked. It genuinely helps keep Wordems free for everyone.</p>
      <button class="sup-remove" type="button" data-act="remove">Remove from this device</button>
    </div>`;
}

function wirePitch(overlay, close) {
  const form = overlay.querySelector("[data-act='unlock']");
  const input = overlay.querySelector(".sup-input");
  const msg = overlay.querySelector(".sup-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = input.value.trim();
    if (!key) return;
    msg.textContent = "Checking…";
    let data;
    try {
      const res = await fetch("/api/license/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      data = await res.json();
    } catch {
      msg.textContent = "Couldn't reach the server — try again in a moment.";
      return;
    }
    if (data?.valid) {
      try {
        localStorage.setItem(LICENSE_KEY_STORE, key);
      } catch {
        /* private mode — the grant still applies for this session */
      }
      grant(SKU.SUPPORTER);
      msg.textContent = "Unlocked — thank you! ★";
      setTimeout(close, 900);
    } else {
      msg.textContent = "That key didn't validate. Double-check it and try again.";
    }
  });
}

function wireThanks(overlay, close) {
  overlay.querySelector("[data-act='remove']").addEventListener("click", () => {
    revoke(SKU.SUPPORTER);
    try {
      localStorage.removeItem(LICENSE_KEY_STORE);
    } catch {
      /* ignore */
    }
    close();
  });
}
