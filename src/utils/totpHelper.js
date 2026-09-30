/**
 * RFC 6238 / RFC 4226 Time-based One-Time Password (TOTP) Engine
 * Generates & Verifies 6-digit secret codes changing every 30 seconds
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator & 1Password
 */

// Base32 Character Set for Authenticator Apps
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToBytes(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_CHARS.indexOf(clean.charAt(i));
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return bytes;
}

/**
 * Generate a random 16-character Base32 TOTP secret key for Google Authenticator (80 bits)
 */
export function generateTotpSecret() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  let secret = "";
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32_CHARS.charAt(bytes[i] % 32);
  }
  return secret;
}

/**
 * Generate otpauth:// URI for QR Code rendering in Google Authenticator / Authy
 */
export function getTotpUri(secret, accountName = (import.meta.env?.VITE_ADMIN_EMAIL || "admin@example.com"), issuer = "Govindasamy & Co Admin") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=30&digits=6&algorithm=SHA1`;
}

/**
 * Calculate 6-digit TOTP code for a given secret at current 30-second step
 */
export async function generateTotpCode(secret, timeStepOffset = 0) {
  const timeStep = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
  const keyBytes = base32ToBytes(secret);

  const msgBuffer = new ArrayBuffer(8);
  const msgView = new DataView(msgBuffer);
  msgView.setUint32(4, timeStep, false); // 64-bit integer, low 32 bits

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, msgBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (codeInt % 1000000).toString().padStart(6, "0");
  return otp;
}

/**
 * Verify 6-digit TOTP code against secret (allows ±2 time windows to tolerate clock drift and strips spaces/dashes)
 */
export async function verifyTotpCode(secret, inputCode) {
  const cleanInput = String(inputCode || '').replace(/\D/g, '');
  if (cleanInput.length !== 6) return false;

  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const validCode = await generateTotpCode(secret, offset);
    if (validCode === cleanInput) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate remaining seconds until next 30s code rotation
 */
export function getRemainingTotpSeconds() {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}
