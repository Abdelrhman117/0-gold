/**
 * Firebase Admin SDK — server-side ONLY.
 * Lazy-initialized: env vars are read on first call, not at module import time.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth,      type Auth }                 from "firebase-admin/auth";
import { getFirestore, type Firestore }            from "firebase-admin/firestore";

let _app:  App       | undefined;
let _auth: Auth      | undefined;
let _db:   Firestore | undefined;

function app(): App {
  if (_app) return _app;
  if (getApps().length > 0) return (_app = getApps()[0]);

  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "")
    .replace(/\\n/g, "\n");

  return (_app = initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey,
    }),
  }));
}

export function adminAuth(): Auth {
  return (_auth ??= getAuth(app()));
}

export function adminDb(): Firestore {
  return (_db ??= getFirestore(app()));
}
