/**
 * Firebase Admin SDK singleton — server-side ONLY.
 * Imported by API routes and Server Components; never bundled to the client.
 * Uses lazy initialization so env vars are only read at request time, not build time.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth,      type Auth }                 from "firebase-admin/auth";
import { getFirestore, type Firestore }            from "firebase-admin/firestore";

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }
  _app = initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      // Vercel env vars may contain literal \n — replace before use.
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
  return _app;
}

export const adminAuth: Auth    = new Proxy({} as Auth,    { get: (_, p) => Reflect.get(getAuth(getAdminApp()),      p) });
export const adminDb:   Firestore = new Proxy({} as Firestore, { get: (_, p) => Reflect.get(getFirestore(getAdminApp()), p) });
