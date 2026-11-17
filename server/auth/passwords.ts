import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export const BCRYPT_COST = 12;
const MAX_PASSWORD_LENGTH = 200;

export function passwordError(password: string, email: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return 'Password is too long';
  }
  if (password.toLowerCase() === email.trim().toLowerCase()) {
    return 'Password must not match the email';
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

let dummyHashPromise: Promise<string> | null = null;

/** Spend a compare when the account does not exist so missing emails are not obviously faster. */
export function verifyAgainstDummy(password: string): Promise<boolean> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('gridcity-dummy-password');
  return dummyHashPromise.then((hash) => verifyPassword(password || 'x', hash));
}

export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
