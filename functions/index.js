/**
 * Firebase Cloud Functions entry point.
 * All callable functions for the 0% Gold Shop POS system.
 */

// Re-export settlement functions
const settlement = require("./settlement");
exports.settleSupplierWeight    = settlement.settleSupplierWeight;
exports.addSupplierLedgerEntry  = settlement.addSupplierLedgerEntry;

// ─── Set Super Admin custom claim ──────────────────────────────────────────────

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth }                = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();

/**
 * Callable: promote an existing user to super_admin.
 * Requires the caller to already be a super_admin.
 */
exports.setSuperAdminClaim = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth?.token?.super_admin) {
      throw new HttpsError("permission-denied", "فقط المشرفون يمكنهم منح هذا الدور.");
    }
    const { uid } = request.data;
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "UID صالح مطلوب.");
    }

    await getAuth().setCustomUserClaims(uid, { super_admin: true });
    await getFirestore().collection("audit_super_admin").add({
      action:       "SET_SUPER_ADMIN",
      target_uid:   uid,
      performed_by: request.auth.uid,
      timestamp:    FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

/**
 * Callable: bootstrap the very first super admin using a shared secret.
 * DELETE this function from deployment after the first super admin is created.
 */
exports.bootstrapSuperAdmin = onCall(
  { region: "us-central1" },
  async (request) => {
    const SECRET = process.env.BOOTSTRAP_SECRET;
    const { uid, secret } = request.data;

    if (!SECRET || secret !== SECRET) {
      throw new HttpsError("permission-denied", "مفتاح التهيئة غير صحيح.");
    }
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "UID صالح مطلوب.");
    }

    await getAuth().getUser(uid); // throws if user doesn't exist
    await getAuth().setCustomUserClaims(uid, { super_admin: true });
    await getFirestore().collection("audit_super_admin").add({
      action:    "BOOTSTRAP_SUPER_ADMIN",
      target_uid: uid,
      timestamp:  FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
