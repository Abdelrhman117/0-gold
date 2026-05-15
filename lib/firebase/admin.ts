/**
 * Firebase Admin SDK — server-side ONLY.
 * Lazy-initialized on first call so env vars are read at request time, not build time.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth,      type Auth }                 from "firebase-admin/auth";
import { getFirestore, type Firestore }            from "firebase-admin/firestore";

let _app:  App       | undefined;
let _auth: Auth      | undefined;
let _db:   Firestore | undefined;

/**
 * Handles every way Vercel (or any host) might store a PEM private key:
 *  1. Literal \n characters  →  "-----BEGIN...\\nMIIE...\\n-----END..."
 *  2. Real newlines already  →  "-----BEGIN...\nMIIE...\n-----END..."
 *  3. Accidentally wrapped in quotes  →  '"-----BEGIN..."'
 *  4. Windows CRLF  →  \r\n
 */
function formatPrivateKey(key: string): string {
  // Strip accidental surrounding quotes
  let k = key.trim().replace(/^["']|["']$/g, "");
  // If no real newlines exist, convert literal \n to real newlines
  if (!k.includes("\n")) {
    k = k.replace(/\\n/g, "\n");
  }
  // Normalize CRLF → LF
  k = k.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return k;
}

function getApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) return (_app = getApps()[0]);

  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env vars missing. " +
      "Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, " +
      "and FIREBASE_ADMIN_PRIVATE_KEY in Vercel → Settings → Environment Variables."
    );
  }

  return (_app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: formatPrivateKey(privateKey),
    }),
  }));
}

export function adminAuth(): Auth {
  return (_auth ??= getAuth(getApp()));
}

export function adminDb(): Firestore {
  return (_db ??= getFirestore(getApp()));
}
