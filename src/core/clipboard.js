// Clipboard access, with an honest failure signal.
//
// navigator.clipboard needs a secure context (https / localhost) AND a user
// gesture; it rejects on plain http and in some in-app browsers. Falls back to
// a hidden textarea + execCommand, and reports honestly if both fail so the UI
// can offer manual selection instead of silently claiming success.
//
// Shared by every game's share button — the fallback path is subtle enough
// that a second copy would drift.

/**
 * Copy text to the clipboard.
 * @returns {Promise<boolean>} whether the copy actually succeeded
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // Keep it off-screen but still selectable; display:none would break select().
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand?.("copy") ?? false;
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}
