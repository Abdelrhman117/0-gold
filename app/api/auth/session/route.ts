/**
 * POST  /api/auth/session  — Exchange a Firebase ID token for httpOnly session cookies.
 * DELETE /api/auth/session — Clear session (logout).
 *
 * The middleware reads __session, __role, and __tenant cookies to make
 * routing decisions without hitting Firebase on every request.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path:     "/",
};

const SESSION_TTL_MS  = 14 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SEC = SESSION_TTL_MS / 1000;

export async function POST(request: NextRequest) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) return NextResponse.json({ error: "idToken required" }, { status: 400 });

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_TTL_MS,
    });

    const decoded  = await adminAuth.verifyIdToken(idToken);
    const role     = decoded.super_admin ? "super_admin" : (decoded.role as string) ?? "";
    const tenantId = (decoded.tenant_id as string) ?? "";

    const res = NextResponse.json({ ok: true });
    res.cookies.set("__session", sessionCookie, { ...COOKIE_OPTS, maxAge: SESSION_TTL_SEC });
    res.cookies.set("__role",    role,           { ...COOKIE_OPTS, maxAge: SESSION_TTL_SEC });
    res.cookies.set("__tenant",  tenantId,       { ...COOKIE_OPTS, maxAge: SESSION_TTL_SEC });
    return res;
  } catch (err) {
    console.error("[session] POST:", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  ["__session", "__role", "__tenant"].forEach((name) =>
    res.cookies.set(name, "", { ...COOKIE_OPTS, maxAge: 0 })
  );
  return res;
}
