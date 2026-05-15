/**
 * Supplier Settlement Cloud Function
 *
 * Converts a specified weight of gold owed (in 21K-equivalent grams) into a
 * cash liability, using today's live price per gram. The operation is fully
 * atomic via a Firestore Transaction — either both ledgers update or neither.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();

const db = getFirestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert any karat weight to 21K-equivalent grams.
 * Formula: weight × (karat / 21)
 */
function toEquivalent21k(weight, karat) {
  return parseFloat(((weight * karat) / 21).toFixed(6));
}

function assertPositiveNumber(value, name) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new HttpsError("invalid-argument", `${name} يجب أن يكون رقماً موجباً.`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${name} مطلوب.`);
  }
}

// ─── settleSupplierWeight ──────────────────────────────────────────────────────

/**
 * Callable: settle X grams of weight owed into cash owed.
 *
 * Request data:
 *   tenant_id          string   — the tenant this supplier belongs to
 *   supplier_id        string   — Firestore document ID of the supplier
 *   weight_to_settle   number   — grams (21K equivalent) to convert
 *   price_per_gram_21k number   — today's agreed price per gram (21K)
 *   notes              string?  — optional settlement note
 *
 * Returns: { new_weight_balance, new_cash_balance, cash_value_settled }
 */
exports.settleSupplierWeight = onCall(
  { region: "us-central1" },
  async (request) => {
    // ── Auth guard ────────────────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول.");
    }

    const claims   = request.auth.token;
    const isSuperAdmin = claims.super_admin === true;
    const callerTenant = claims.tenant_id;
    const callerRole   = claims.role;

    // ── Input validation ──────────────────────────────────────────────────────
    const { tenant_id, supplier_id, weight_to_settle, price_per_gram_21k, notes } = request.data;

    assertString(tenant_id,    "tenant_id");
    assertString(supplier_id,  "supplier_id");
    assertPositiveNumber(weight_to_settle,   "weight_to_settle");
    assertPositiveNumber(price_per_gram_21k, "price_per_gram_21k");

    // Only super admins or owners/admins of the same tenant may settle.
    const allowed =
      isSuperAdmin ||
      (callerTenant === tenant_id && (callerRole === "owner" || callerRole === "admin"));

    if (!allowed) {
      throw new HttpsError("permission-denied", "ليس لديك صلاحية إجراء التسوية.");
    }

    const supplierRef = db.doc(`tenants/${tenant_id}/suppliers/${supplier_id}`);

    // ── Transaction ───────────────────────────────────────────────────────────
    const result = await db.runTransaction(async (tx) => {
      const supplierSnap = await tx.get(supplierRef);

      if (!supplierSnap.exists()) {
        throw new HttpsError("not-found", "لم يُعثر على المورّد.");
      }

      const supplier = supplierSnap.data();
      const currentWeightBalance = supplier.weight_balance_21k ?? 0;
      const currentCashBalance   = supplier.cash_balance ?? 0;

      if (currentWeightBalance < weight_to_settle) {
        throw new HttpsError(
          "failed-precondition",
          `رصيد الوزن غير كافٍ. المتاح: ${currentWeightBalance.toFixed(3)} جم (معيار 21).`
        );
      }

      const cashValueSettled    = parseFloat((weight_to_settle * price_per_gram_21k).toFixed(2));
      const newWeightBalance    = parseFloat((currentWeightBalance - weight_to_settle).toFixed(6));
      const newCashBalance      = parseFloat((currentCashBalance + cashValueSettled).toFixed(2));

      // Update supplier balances.
      tx.update(supplierRef, {
        weight_balance_21k: newWeightBalance,
        cash_balance:        newCashBalance,
        updated_at:          FieldValue.serverTimestamp(),
      });

      // Append ledger entry.
      const ledgerRef = db.collection(
        `tenants/${tenant_id}/suppliers/${supplier_id}/ledger_entries`
      ).doc();

      tx.set(ledgerRef, {
        id:                  ledgerRef.id,
        type:                "settlement",
        weight_settled_21k:  weight_to_settle,
        price_per_gram_21k,
        cash_value:          cashValueSettled,
        weight_before:       currentWeightBalance,
        weight_after:        newWeightBalance,
        cash_before:         currentCashBalance,
        cash_after:          newCashBalance,
        currency:            supplier.currency ?? "SAR",
        notes:               notes ?? null,
        performed_by:        request.auth.uid,
        created_at:          FieldValue.serverTimestamp(),
      });

      return {
        new_weight_balance:  newWeightBalance,
        new_cash_balance:    newCashBalance,
        cash_value_settled:  cashValueSettled,
      };
    });

    return { success: true, ...result };
  }
);

// ─── addSupplierLedgerEntry ────────────────────────────────────────────────────

/**
 * Callable: record a raw weight or cash debit/credit on a supplier ledger.
 * Used when purchasing gold (weight credit) or making cash payments (cash debit).
 *
 * Request data:
 *   tenant_id    string
 *   supplier_id  string
 *   entry_type   "weight_credit" | "weight_debit" | "cash_credit" | "cash_debit"
 *   amount       number   — grams for weight entries, currency for cash entries
 *   karat        number?  — required for weight entries; converted to 21K internally
 *   reference    string?  — invoice ID or note
 */
exports.addSupplierLedgerEntry = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول.");

    const { tenant_id, supplier_id, entry_type, amount, karat, reference } = request.data;

    assertString(tenant_id,   "tenant_id");
    assertString(supplier_id, "supplier_id");
    assertString(entry_type,  "entry_type");
    assertPositiveNumber(amount, "amount");

    const validTypes = ["weight_credit", "weight_debit", "cash_credit", "cash_debit"];
    if (!validTypes.includes(entry_type)) {
      throw new HttpsError("invalid-argument", `نوع القيد غير صالح: ${entry_type}`);
    }

    const isWeightEntry = entry_type.startsWith("weight");
    if (isWeightEntry && !karat) {
      throw new HttpsError("invalid-argument", "العيار مطلوب لقيود الوزن.");
    }

    const supplierRef = db.doc(`tenants/${tenant_id}/suppliers/${supplier_id}`);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(supplierRef);
      if (!snap.exists()) throw new HttpsError("not-found", "لم يُعثر على المورّد.");

      const data = snap.data();
      const equivalent21k = isWeightEntry ? toEquivalent21k(amount, karat) : 0;

      let weightDelta = 0;
      let cashDelta   = 0;

      if (entry_type === "weight_credit") weightDelta = +equivalent21k;
      if (entry_type === "weight_debit")  weightDelta = -equivalent21k;
      if (entry_type === "cash_credit")   cashDelta   = +amount;
      if (entry_type === "cash_debit")    cashDelta   = -amount;

      const newWeight = parseFloat(((data.weight_balance_21k ?? 0) + weightDelta).toFixed(6));
      const newCash   = parseFloat(((data.cash_balance         ?? 0) + cashDelta).toFixed(2));

      tx.update(supplierRef, {
        weight_balance_21k: newWeight,
        cash_balance:        newCash,
        updated_at:          FieldValue.serverTimestamp(),
      });

      const entryRef = db.collection(
        `tenants/${tenant_id}/suppliers/${supplier_id}/ledger_entries`
      ).doc();

      tx.set(entryRef, {
        id:             entryRef.id,
        type:           entry_type,
        amount,
        karat:          karat ?? null,
        equivalent_21k: equivalent21k,
        weight_delta:   weightDelta,
        cash_delta:     cashDelta,
        reference:      reference ?? null,
        performed_by:   request.auth.uid,
        created_at:     FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
