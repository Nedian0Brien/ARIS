import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '@/lib/config';

const DEFAULT_SALT = 'aris-ssh-settings-v1';

function deriveKey(salt: string): Buffer {
  return scryptSync(env.SSH_KEY_ENCRYPTION_SECRET, salt, 32) as Buffer;
}

export function encryptScopedSetting(plaintext: string, salt: string = DEFAULT_SALT): string {
  const iv = randomBytes(16);
  const key = deriveKey(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptScopedSetting(ciphertext: string, salt: string = DEFAULT_SALT): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = deriveKey(salt);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf-8');
}

export function encryptSetting(plaintext: string): string {
  return encryptScopedSetting(plaintext, DEFAULT_SALT);
}

export function decryptSetting(ciphertext: string): string {
  return decryptScopedSetting(ciphertext, DEFAULT_SALT);
}
