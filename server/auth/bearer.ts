import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return timingSafeEqual(left, right);
}

/** GRIDBOT_ESCALATE_INJECT_TOKEN, with GRIDBOT_INJECT_TOKEN as an alias. */
export function bearerOk(req: Request): boolean {
  const expected = (
    process.env.GRIDBOT_ESCALATE_INJECT_TOKEN ||
    process.env.GRIDBOT_INJECT_TOKEN ||
    ''
  ).trim();
  if (!expected) return false;
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return false;
  return safeEqual(match[1], expected);
}

export const INJECT_REPLY_PATH = /^\/api\/bot\/escalate\/[^/]+\/reply$/;
