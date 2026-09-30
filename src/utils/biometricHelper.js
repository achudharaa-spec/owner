/**
 * WebAuthn Biometric Fingerprint / Touch ID / Windows Hello Verification
 * Requires physical fingerprint / biometric verification before revealing QR code.
 */

export async function verifyBiometricFingerprint() {
  // Check if WebAuthn is supported by the browser
  if (typeof window !== "undefined" && window.PublicKeyCredential) {
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const creationOptions = {
        publicKey: {
          rp: { name: "Govindasamy & Co Admin Security" },
          user: {
            id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
            name: import.meta.env?.VITE_ADMIN_EMAIL || "admin@example.com",
            displayName: "Admin Owner (Fingerprint Protected)"
          },
          challenge: challenge,
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },  // ES256
            { type: "public-key", alg: -257 } // RS256
          ],
          timeout: 60000,
          authenticatorSelection: {
            userVerification: "required" // Forces Fingerprint / Touch ID / Windows Hello prompt!
          }
        }
      };

      // Triggers native Windows Hello Fingerprint / Touch ID prompt!
      const credential = await navigator.credentials.create(creationOptions);
      if (credential) {
        return { success: true };
      }
    } catch (err) {
      console.warn("Biometric authentication error or canceled by user:", err.message);
      return { success: false, reason: err.message || "Biometric authentication was cancelled or failed." };
    }
  }

  return { success: false, reason: "Biometric authentication (Windows Hello / Touch ID) is not supported on this browser/device." };
}
