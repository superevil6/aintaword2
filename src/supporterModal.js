// Support dialog — a plain tip jar.
//
// The site is free and every feature is free (themes, archive, cross-device
// sync). There is no tier to buy and nothing to unlock, so this dialog does one
// thing: invite a voluntary tip and point at the donation link (DONATION_URL).
//
// It deliberately holds NO payment or identity logic — that all left with the
// old merchant-of-record supporter tier. If DONATION_URL is empty the dialog
// still opens and reads sensibly ("coming soon"), so the Support button is
// never dead while the jar is being set up.

import { DONATION_URL } from "./config.js";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

/** Open the support / tip-jar dialog. */
export function openSupporter() {
  const overlay = document.createElement("div");
  overlay.className = "supporter-overlay";
  overlay.innerHTML = modalHtml();

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

  document.body.appendChild(overlay);
  // Focus the first actionable element (the tip link, or the close button when
  // there's no link yet).
  overlay.querySelector("a, button").focus();
}

function modalHtml() {
  const cta = DONATION_URL
    ? `<a class="sup-buy" href="${esc(DONATION_URL)}" target="_blank" rel="noopener">Leave a tip →</a>`
    : `<p class="sup-soon">A tip jar is on the way — thank you for even thinking about it.</p>`;
  return `
    <div class="supporter-modal" role="dialog" aria-modal="true" aria-label="Support Wordems">
      <button class="sup-close" type="button" data-act="close" aria-label="Close">✕</button>
      <h2 class="sup-title">Support Wordems</h2>
      <p class="sup-lede">Wordems is free — every game, every theme, the archive, all of it. If it's brightened your day and you feel like chipping in, a tip helps cover the bills. Entirely optional, and nothing is locked behind it.</p>
      ${cta}
      <p class="sup-legal">A tip is a thank-you, not a purchase — you get the same free site either way.</p>
    </div>`;
}
