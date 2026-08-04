/**
 * Credential vault (server only).
 *
 * Passwords the agent needs are encrypted with AES-256-GCM using a key that
 * only the server holds (`CREDENTIAL_VAULT_KEY`). The ciphertext lives in
 * `agent_credential_secrets`, a table with no grants for `authenticated`, so a
 * stolen browser session cannot read it and a leaked database dump is useless
 * without the server key.
 *
 * Never import this file from a component.
 */

const KEY_ENV = ["CREDENTIAL_VAULT_KEY", "AGENT_VAULT_KEY"] as const;

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

function rawKey(): string | null {
  for (const name of KEY_ENV) {
    const value = process.env[name];
    if (value && value.trim().length >= 16) return value.trim();
  }
  return null;
}

export function vaultConfigured(): boolean {
  return rawKey() !== null;
}

async function cryptoKey(): Promise<CryptoKey> {
  const secret = rawKey();
  if (!secret) {
    throw new VaultError(
      "Credential vault is not configured. Set CREDENTIAL_VAULT_KEY (32+ random characters) on the server.",
    );
  }
  // Hash to exactly 256 bits so any passphrase length works.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const fromB64 = (value: string) => new Uint8Array(Buffer.from(value, "base64"));

export interface SealedSecret {
  ciphertext: string;
  iv: string;
}

export async function sealSecret(plaintext: string): Promise<SealedSecret> {
  if (!plaintext) throw new VaultError("Nothing to encrypt.");
  const key = await cryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toB64(new Uint8Array(sealed)), iv: toB64(iv) };
}

export async function openSecret(sealed: SealedSecret): Promise<string> {
  const key = await cryptoKey();
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(sealed.iv) },
      key,
      fromB64(sealed.ciphertext),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new VaultError(
      "Stored password could not be decrypted — the vault key changed. Re-save the credential.",
    );
  }
}
