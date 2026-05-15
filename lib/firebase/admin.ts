/**
 * Firebase Admin SDK singleton — server-side ONLY.
 * Imported by API routes and Server Components; never bundled to the client.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth,      type Auth }                 from "firebase-admin/auth";
import { getFirestore, type Firestore }            from "firebase-admin/firestore";

function createAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      // Vercel env vars may contain literal \n — replace before use.
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    }),
  });
}

const adminApp: App      = createAdminApp();
const adminAuth: Auth    = getAuth(adminApp);
const adminDb: Firestore = getFirestore(adminApp);

export { adminApp, adminAuth, adminDb };
