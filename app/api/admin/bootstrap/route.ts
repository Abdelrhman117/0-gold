/**
 * POST /api/admin/bootstrap
 * One-time route — creates alwazer@admin.com as super admin.
 * Protected by BOOTSTRAP_SECRET env var.
 * Call once after deploy, then this route becomes a no-op.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "BOOTSTRAP_SECRET is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.secret !== secret) {
    return NextResponse.json({ error: "Invalid secret." }, { status: 403 });
  }

  const email    = "alwazer@admin.com";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? body.password;

  if (!password) {
    return NextResponse.json({ error: "SUPER_ADMIN_PASSWORD env var or password in body required." }, { status: 400 });
  }

  try {
    // Create user or get existing
    let uid: string;
    try {
      const existing = await adminAuth.getUserByEmail(email);
      uid = existing.uid;
    } catch {
      const created = await adminAuth.createUser({ email, password, displayName: "Super Admin" });
      uid = created.uid;
    }

    // Set super_admin custom claim
    await adminAuth.setCustomUserClaims(uid, { super_admin: true });

    // Audit log
    await adminDb.collection("audit_super_admin").add({
      action:    "BOOTSTRAP_SUPER_ADMIN",
      target_uid: uid,
      email,
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, uid, email });
  } catch (err) {
    console.error("[bootstrap]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
