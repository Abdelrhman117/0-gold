import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "./config";
import type {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  PaymentMethod,
  PaymentRecord,
  InventoryItem,
  GoldKarat,
  WeightUnit,
  CurrencyCode,
} from "@/types";

// ─── POS-specific types ───────────────────────────────────────────────────────

export interface ScrapGoldEntry {
  id:                    string;
  karat:                 GoldKarat;
  weight:                number;
  weight_unit:           WeightUnit;
  buying_price_per_gram: number;
  total_value:           number;
  description?:          string;
}

export interface CartLineItem {
  inventory_item:    InventoryItem & { net_weight?: number };
  agreed_gram_price: number;
  line_total:        number;
}

export interface GoldPrices {
  price_per_gram_24k: number;
  price_per_gram_21k: number;
  price_per_gram_18k: number;
  currency:           CurrencyCode;
  updated_at:         Timestamp;
}

export interface CreateInvoiceParams {
  cart_items:        CartLineItem[];
  scrap_items:       ScrapGoldEntry[];
  cashier_uid:       string;
  gold_rate_at_sale: number;
  payment_method:    PaymentMethod;
  cash_received:     number;
  card_amount:       number;
  discount:          number;
  currency:          CurrencyCode;
  customer_name?:    string;
  customer_phone?:   string;
  notes?:            string;
}

export interface CreateInvoiceResult {
  invoice_id:     string;
  invoice_number: string;
  queued_offline: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcLineTotal(item: InventoryItem & { net_weight?: number }, gramPrice: number): number {
  const goldWeight = (item.net_weight ?? 0) > 0 ? item.net_weight! : item.weight;
  return goldWeight * gramPrice + (item.making_charge ?? 0);
}

function timestampInvoiceNumber(): string {
  const now = new Date();
  const yy  = now.getFullYear();
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const dd  = String(now.getDate()).padStart(2, "0");
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${yy}${mm}${dd}-${rnd}`;
}

function buildLineItems(cartItems: CartLineItem[]): InvoiceLineItem[] {
  return cartItems.map((ci) => ({
    item_id:    ci.inventory_item.id,
    sku:        ci.inventory_item.sku,
    name_ar:    ci.inventory_item.name_ar,
    karat:      ci.inventory_item.karat,
    weight:     ci.inventory_item.weight,
    weight_unit:ci.inventory_item.weight_unit,
    unit_price: ci.agreed_gram_price,
    quantity:   1,
    discount:   0,
    line_total: ci.line_total,
  }));
}

// ─── Item lookup (works offline via persistent cache) ─────────────────────────

export async function lookupInventoryItem(
  tenantId: string,
  input:    string
): Promise<(InventoryItem & { net_weight?: number }) | null> {
  // Try direct document ID first.
  const byId = await getDoc(doc(db, "tenants", tenantId, "inventory", input));
  if (byId.exists()) return { id: byId.id, ...(byId.data() as Omit<InventoryItem, "id">) };

  // Fallback: query by SKU.
  const q    = query(
    collection(db, "tenants", tenantId, "inventory"),
    where("sku", "==", input),
    limit(1)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() as Omit<InventoryItem, "id">) };
  }

  return null;
}

// ─── Create invoice — Batch write (offline-safe) ──────────────────────────────

export async function createInvoice(
  tenantId: string,
  params:   CreateInvoiceParams
): Promise<CreateInvoiceResult> {
  const {
    cart_items, scrap_items, cashier_uid, gold_rate_at_sale,
    payment_method, cash_received, card_amount, discount, currency,
    customer_name, customer_phone, notes,
  } = params;

  // ── Computed totals ──────────────────────────────────────────────────────────
  const subtotal       = cart_items.reduce((s, i) => s + i.line_total, 0);
  const scrapDeduction = scrap_items.reduce((s, e) => s + e.total_value, 0);
  const discountTotal  = discount;
  const grandTotal     = Math.max(0, subtotal - scrapDeduction - discountTotal);
  const amountPaid     = Math.min(grandTotal, cash_received + card_amount);
  const balanceDue     = Math.max(0, grandTotal - amountPaid);
  const status: InvoiceStatus = balanceDue > 0 ? "partial" : "paid";

  const payments: PaymentRecord[] = [];
  if (cash_received > 0) payments.push({ method: "cash", amount: cash_received, paid_at: Timestamp.now() });
  if (card_amount  > 0) payments.push({ method: "card", amount: card_amount,  paid_at: Timestamp.now() });

  const invoiceRef  = doc(collection(db, "tenants", tenantId, "invoices"));
  const invoiceId   = invoiceRef.id;
  const lineItems   = buildLineItems(cart_items);

  // ── Try atomic transaction (requires network) ────────────────────────────────
  let invoiceNumber: string;
  let queuedOffline = false;

  try {
    const counterRef = doc(db, "tenants", tenantId, "settings", "invoice_counter");
    invoiceNumber = await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const count = counterSnap.exists() ? (counterSnap.data().count as number) : 0;
      const next  = count + 1;
      tx.set(counterRef, { count: next }, { merge: true });
      return `INV-${new Date().getFullYear()}-${String(next).padStart(5, "0")}`;
    });
  } catch {
    // Offline — fall back to timestamp-based number; batch will be queued.
    invoiceNumber = timestampInvoiceNumber();
    queuedOffline = true;
  }

  // ── Batch: write invoice + mark each item as sold ─────────────────────────
  const batch = writeBatch(db);

  batch.set(invoiceRef, {
    id:                invoiceId,
    tenant_id:         tenantId,
    invoice_number:    invoiceNumber,
    type:              "sale",
    status,
    customer_name:     customer_name ?? null,
    customer_phone:    customer_phone ?? null,
    line_items:        lineItems,
    scrap_items:       scrap_items,
    subtotal,
    scrap_deduction:   scrapDeduction,
    discount_total:    discountTotal,
    tax_rate:          0,
    tax_amount:        0,
    grand_total:       grandTotal,
    amount_paid:       amountPaid,
    balance_due:       balanceDue,
    currency,
    gold_rate_at_sale,
    payments,
    cashier_uid,
    notes:             notes ?? null,
    queued_offline:    queuedOffline,
    created_at:        serverTimestamp(),
    updated_at:        serverTimestamp(),
  });

  for (const ci of cart_items) {
    batch.update(doc(db, "tenants", tenantId, "inventory", ci.inventory_item.id), {
      status:     "sold",
      updated_at: serverTimestamp(),
    });
  }

  await batch.commit();

  return { invoice_id: invoiceId, invoice_number: invoiceNumber, queued_offline: queuedOffline };
}

// ─── Void invoice ─────────────────────────────────────────────────────────────

export async function voidInvoice(
  tenantId:    string,
  invoiceId:   string,
  reason:      string,
  voidedByUid: string
): Promise<void> {
  const batch    = writeBatch(db);
  const invRef   = doc(db, "tenants", tenantId, "invoices", invoiceId);
  const invSnap  = await getDoc(invRef);
  if (!invSnap.exists()) throw new Error("Invoice not found");

  const data = invSnap.data() as Invoice & { line_items: InvoiceLineItem[] };

  batch.update(invRef, {
    status:      "voided",
    voided_by:   voidedByUid,
    voided_at:   serverTimestamp(),
    void_reason: reason,
    updated_at:  serverTimestamp(),
  });

  // Restore inventory items to available.
  for (const li of data.line_items) {
    batch.update(doc(db, "tenants", tenantId, "inventory", li.item_id), {
      status:     "available",
      updated_at: serverTimestamp(),
    });
  }

  await batch.commit();
}

// ─── Real-time invoice list ───────────────────────────────────────────────────

export function subscribeToInvoices(
  tenantId: string,
  onUpdate: (invoices: Invoice[]) => void,
  opts?: { status?: InvoiceStatus; pageSize?: number }
): Unsubscribe {
  const constraints: Parameters<typeof query>[1][] = [
    orderBy("created_at", "desc"),
    limit(opts?.pageSize ?? 50),
  ];
  if (opts?.status) constraints.unshift(where("status", "==", opts.status));

  return onSnapshot(
    query(collection(db, "tenants", tenantId, "invoices"), ...constraints),
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)))
  );
}

// ─── Gold prices subscription ─────────────────────────────────────────────────

export function subscribeToGoldPrices(
  tenantId: string,
  onUpdate: (prices: GoldPrices) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "tenants", tenantId, "settings", "gold_prices"),
    (snap) => {
      if (snap.exists()) onUpdate(snap.data() as GoldPrices);
    }
  );
}
