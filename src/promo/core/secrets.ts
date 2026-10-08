/**
 * Refreshed platform tokens are stored encrypted in promo-data/secrets.enc.json (docs/promo/PLAN.md §6).
 * AES-256-GCM with a key derived from PROMO_SECRET_KEY; without that key nothing is stored.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface Sealed {
  iv: string;
  tag: string;
  data: string;
}

const keyOf = (secret: string) => createHash('sha256').update(`promo-agent:${secret}`).digest();

export function seal(secret: string, plain: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/** Null when the key is wrong or the data was tampered with. */
export function unseal(secret: string, sealed: Sealed): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** `from` fingerprints the token in Secrets this one was refreshed from; a new Secret wins over a stale refresh. */
export type SealedTokens = Partial<Record<'threads' | 'instagram', Sealed & { savedAt: string; from: string }>>;

export const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 16);

/** The token to use: the stored refresh if it descends from today's Secret, else the Secret itself. */
export function pickToken(envToken: string, stored: (Sealed & { from: string }) | undefined, secret: string | null): { token: string; refreshed: boolean } {
  if (stored && secret && stored.from === fingerprint(envToken)) {
    const t = unseal(secret, stored);
    if (t) return { token: t, refreshed: true };
  }
  return { token: envToken, refreshed: false };
}

export function parseSealed(text: string | null): SealedTokens {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}
