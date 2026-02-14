/**
 * Handles AES-GCM encryption for messages and PBKDF2 for room keys.
 */

export const generateRoomKey = async (password: string, salt: string): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

export const encryptData = async (key: CryptoKey, data: string): Promise<{ iv: string; cipherText: string }> => {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = enc.encode(data);

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encodedData
  );

  // Convert buffer to base64
  const cipherText = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  const ivString = btoa(String.fromCharCode(...iv));

  return { iv: ivString, cipherText };
};

export const decryptData = async (key: CryptoKey, cipherText: string, ivString: string): Promise<string> => {
  try {
    const dec = new TextDecoder();
    const encryptedData = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivString), c => c.charCodeAt(0));

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      encryptedData
    );

    return dec.decode(decrypted);
  } catch (e) {
    console.error("Decryption failed", e);
    return "[[Encrypted Message: Unable to Decrypt]]";
  }
};

export const generateId = (): string => {
  return crypto.randomUUID();
};

export const generateRoomId = (): string => {
  // Generate a random 8-character alphanumeric string (e.g. A7X2-9PQS)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, 1, O, 0 to avoid confusion
  let result = '';
  const randomValues = new Uint8Array(8);
  window.crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < 8; i++) {
    if (i === 4) result += '-';
    result += chars[randomValues[i] % chars.length];
  }
  return result;
};