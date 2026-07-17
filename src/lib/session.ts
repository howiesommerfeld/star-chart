import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Parent session (eng plan D7): httpOnly cookie, 15-minute IDLE expiry,
 * sliding on each authorised parent request. Format: `<expiresMs>.<hmac>`.
 * Family threat model: keeps little fingers out after morning confirm —
 * not real security, exactly like the design doc's gate.
 */

export const PARENT_COOKIE = "sc_parent";
export const SESSION_IDLE_MS = 15 * 60 * 1000;

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function mintSession(now = Date.now()): string {
  const exp = String(now + SESSION_IDLE_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expected = sign(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > now;
}

export function verifyPin(pin: string): boolean {
  const expected = process.env.PARENT_PIN ?? "";
  if (expected.length === 0 || pin.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(pin), Buffer.from(expected));
}
