// Anonymous device-sync identity.
//
// Cross-device sync is keyed by a random "sync code" the client generates
// locally — a bearer capability, not an account. It carries NO personal
// information: there is nothing to hash, salt, or leak, because the code itself
// IS the only identity. Whoever holds the code can read and write that history,
// so it is high-entropy and unguessable and should be treated like a password.
//
// Link two devices by generating a code on one and entering it on the other;
// both then read and write the same bucket, and history.js's union-merge keeps
// their records conflict-free.

const KEY = "aintaword2:synccode";

// Crockford base32 — omits I, L, O and U so a code stays unambiguous when typed
// or read aloud. 26 symbols × 5 bits = 130 bits of entropy.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 26;

/** The stored code for this device, or "" if sync isn't set up. */
export function getSyncCode() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/** True once this device has opted into sync (holds a code). */
export function hasSyncCode() {
  return getSyncCode() !== "";
}

function store(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* private mode / quota — sync just won't persist across reloads */
  }
}

/** Generate + persist a fresh code if none exists; return the current code. */
export function ensureSyncCode() {
  const existing = getSyncCode();
  if (existing) return existing;
  const code = generateCode();
  store(code);
  return code;
}

/**
 * Adopt an external code (linking another device). Normalises and validates the
 * input first.
 * @returns {string} the canonical code stored, or "" if the input was invalid.
 */
export function adoptSyncCode(input) {
  const code = canonicalizeCode(input);
  if (!isValidCode(code)) return "";
  store(code);
  return code;
}

/** Forget this device's code — stops syncing and unlinks it. */
export function clearSyncCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** A cryptographically-random code in canonical (dash-free, upper-case) form. */
export function generateCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  // byte & 31 is uniform over 0..31, so each symbol carries a full 5 bits.
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

/** Strip spaces and dashes and upper-case, so typed and pasted codes normalise. */
export function canonicalizeCode(input) {
  return String(input || "").replace(/[\s-]/g, "").toUpperCase();
}

/** Whether a canonicalised code is well-formed. */
export function isValidCode(code) {
  return new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`).test(code);
}

/** Group into 4s for display: XXXX-XXXX-… (never stored this way). */
export function formatCode(code) {
  return canonicalizeCode(code).replace(/(.{4})(?=.)/g, "$1-");
}
