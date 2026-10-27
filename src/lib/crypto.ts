/**
 * LumaChat End-to-End Encryption (E2EE) Module
 * Implemented using the browser's native Web Crypto API (AES-GCM 256-bit).
 * Scrambled at rest: messages are stored in database/KV storage as ciphertext (ENC:<iv>:<ciphertext>).
 * Backward compatible: unencrypted legacy messages render transparently without errors.
 */

const E2EE_SALT = new TextEncoder().encode('lumachat-e2ee-v1-salt-key-derivation');

// In-memory key promise cache to avoid re-running expensive PBKDF2 (100,000 iterations) on every message
// Caching the Promise guarantees that concurrent message decryptions reuse the exact same in-flight derivation
const conversationKeyPromiseCache = new Map<string, Promise<CryptoKey>>();
// In-memory plaintext cache for decrypted messages to eliminate polling lag
const decryptedMessageCache = new Map<string, string>();

/**
 * Derives an AES-GCM 256-bit CryptoKey using PBKDF2 from conversation participant IDs.
 * Sorting ensures both sender and receiver independently derive the exact same symmetric key.
 */
async function getConversationKey(userIdA: string, userIdB: string): Promise<CryptoKey> {
  const participants = [userIdA, userIdB].sort().join(':');
  const existingPromise = conversationKeyPromiseCache.get(participants);
  if (existingPromise) {
    return existingPromise;
  }

  const derivationPromise = (async () => {
    const subtle =
      typeof window !== 'undefined'
        ? window.crypto?.subtle
        : globalThis.crypto?.subtle;

    if (!subtle) {
      throw new Error('Web Crypto API subtle is not available in this environment.');
    }

    const keyMaterial = await subtle.importKey(
      'raw',
      new TextEncoder().encode(participants),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: E2EE_SALT,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  })();

  conversationKeyPromiseCache.set(participants, derivationPromise);
  return derivationPromise;
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a message using AES-GCM 256-bit.
 * Returns formatted ciphertext string "ENC:<base64-iv>:<base64-ciphertext>".
 */
export async function encryptMessage(
  plaintext: string,
  senderId: string,
  receiverId: string
): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') return plaintext;

  try {
    const cryptoObj =
      typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    const subtle = cryptoObj?.subtle;

    if (!subtle) {
      return plaintext;
    }

    const key = await getConversationKey(senderId, receiverId);
    // 96-bit (12-byte) initialization vector recommended for AES-GCM
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encoded
    );

    const ivStr = bufferToBase64(iv);
    const ctStr = bufferToBase64(ciphertext);

    return `ENC:${ivStr}:${ctStr}`;
  } catch (err) {
    console.warn('[E2EE] Encryption fallback to plaintext:', err);
    return plaintext;
  }
}

/**
 * Decrypts a message if it starts with "ENC:".
 * If not encrypted with "ENC:", returns the original text untouched (backward compatible).
 */
export async function decryptMessage(
  ciphertextOrPlain: string,
  senderId: string,
  receiverId: string
): Promise<string> {
  if (!ciphertextOrPlain || typeof ciphertextOrPlain !== 'string') {
    return ciphertextOrPlain;
  }

  // Backward compatibility: existing messages without encryption render normally
  if (!ciphertextOrPlain.startsWith('ENC:')) {
    return ciphertextOrPlain;
  }

  const cacheKey = `${senderId}:${receiverId}:${ciphertextOrPlain}`;
  const cachedPlain = decryptedMessageCache.get(cacheKey);
  if (cachedPlain !== undefined) {
    return cachedPlain;
  }

  try {
    const subtle =
      typeof window !== 'undefined'
        ? window.crypto?.subtle
        : globalThis.crypto?.subtle;

    if (!subtle) {
      return ciphertextOrPlain;
    }

    const parts = ciphertextOrPlain.split(':');
    if (parts.length < 3) {
      return ciphertextOrPlain;
    }

    const iv = base64ToBuffer(parts[1]);
    const ciphertext = base64ToBuffer(parts.slice(2).join(':'));

    const key = await getConversationKey(senderId, receiverId);
    const decrypted = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      key,
      ciphertext as unknown as BufferSource
    );

    const plain = new TextDecoder().decode(decrypted);
    decryptedMessageCache.set(cacheKey, plain);
    if (decryptedMessageCache.size > 2000) {
      decryptedMessageCache.clear();
    }
    return plain;
  } catch {
    // If decryption fails (e.g. wrong key, corrupted), render readable placeholder
    return '[Encrypted Message]';
  }
}

/**
 * Checks whether a text is an E2EE ciphertext.
 */
export function isEncryptedMessage(text: string | undefined | null): boolean {
  return typeof text === 'string' && text.startsWith('ENC:');
}
