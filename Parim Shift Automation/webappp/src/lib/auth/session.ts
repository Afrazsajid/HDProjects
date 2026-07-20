import { createHmac } from "node:crypto";

const cookieName = "hd_admin_session";

export function authCookieName() {
  return cookieName;
}

function secret() {
  return process.env.AUTH_SECRET || "local-dev-insecure-change-me";
}

export function signSession(email: string, expiresAtMs = Date.now() + 8 * 60 * 60 * 1000) {
  const payload = `${email}.${expiresAtMs}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionCookie(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length < 3) return false;
  const signature = parts.pop();
  const expiresAt = Number(parts.pop());
  const email = parts.join(".");
  if (!signature || !email || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = createHmac("sha256", secret()).update(`${email}.${expiresAt}`).digest("hex");
  return expected === signature;
}
