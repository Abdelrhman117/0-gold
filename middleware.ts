import { NextRequest, NextResponse } from "next/server";
import type { NextMiddleware } from "next/server";

// ─── Route groups ─────────────────────────────────────────────────────────────

const PUBLIC_PREFIXES      = ["/login", "/register", "/api/auth"];
const SUPER_ADMIN_PREFIXES = ["/super-admin"];
const TENANT_PREFIXES      = [
  "/dashboard",
  "/pos",
  "/inventory",
  "/invoices",
  "/suppliers",
  "/offers",
  "/reports",
  "/settings",
];

function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export const middleware: NextMiddleware = (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // Cookies written by POST /api/auth/session after ID-token exchange.
  const session    = request.cookies.get("__session")?.value;
  const role       = request.cookies.get("__role")?.value;
  const tenantId   = request.cookies.get("__tenant")?.value;

  const isAuthed     = Boolean(session);
  const isSuperAdmin = role === "super_admin";
  const hasTenant    = Boolean(tenantId);

  // ── 1. Authenticated users visiting auth pages → redirect home ─────────────
  if (isAuthed && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL(isSuperAdmin ? "/super-admin" : "/dashboard", request.url));
  }

  // ── 2. Public paths ────────────────────────────────────────────────────────
  if (pathname === "/" || matchesAny(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next();
  }

  // ── 3. All protected paths require a session ───────────────────────────────
  if (!isAuthed) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // ── 4. Super-admin-only routes ─────────────────────────────────────────────
  if (matchesAny(pathname, SUPER_ADMIN_PREFIXES) && !isSuperAdmin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── 5. Tenant routes require a tenant_id claim ─────────────────────────────
  if (matchesAny(pathname, TENANT_PREFIXES) && !hasTenant && !isSuperAdmin) {
    return NextResponse.redirect(new URL("/login?error=no_tenant", request.url));
  }

  // ── 6. Forward identity headers to Server Components ──────────────────────
  const headers = new Headers(request.headers);
  headers.set("x-user-role",  role     ?? "");
  headers.set("x-tenant-id",  tenantId ?? "");
  return NextResponse.next({ request: { headers } });
};

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons|screenshots|manifest\\.json|sw\\.js|workbox-.*\\.js).*)",
  ],
};
