import { NextResponse, type NextRequest } from "next/server";

const publicPrefixes = [
  "/login",
  "/api/auth/login",
  "/api/health",
  "/api/webhooks/openwa",
  "/check-in",
  "/api/check-in",
];

function authRequired() {
  return (process.env.AUTH_REQUIRED ?? "true") === "true";
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function validCookie(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length < 3) return false;
  const signature = parts.pop();
  const expiresAt = Number(parts.pop());
  const email = parts.join(".");
  if (!signature || !email || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(process.env.AUTH_SECRET || "local-dev-insecure-change-me", `${email}.${expiresAt}`);
  return expected === signature;
}

export async function proxy(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (publicPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return NextResponse.next();
  if (await validCookie(request.cookies.get("hd_admin_session")?.value)) return NextResponse.next();
  if (path.startsWith("/api/")) return Response.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
