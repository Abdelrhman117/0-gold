import { Timestamp } from "firebase/firestore";

// ─── Shared primitives ────────────────────────────────────────────────────────

export type CurrencyCode = "SAR" | "EGP" | "AED" | "USD";
export type WeightUnit   = "gram" | "ounce" | "tola" | "baht";
export type GoldKarat    = 24 | 22 | 21 | 18 | 14 | 10 | 9;

// ─── Tenant ───────────────────────────────────────────────────────────────────

export type SubscriptionPlan = "trial" | "starter" | "professional" | "enterprise";
export type SubscriptionStatus = "active" | "suspended" | "cancelled" | "past_due";

export interface Tenant {
  id: string;
  name: string;
  logo_url?: string;
  country: string;
  currency: CurrencyCode;
  default_weight_unit: WeightUnit;
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  /** Firestore Timestamp — used by security rules for write-lock check */
  subscription_end: Timestamp;
  owner_uid: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Inventory Item ───────────────────────────────────────────────────────────

export type ItemCategory =
  | "ring"
  | "necklace"
  | "bracelet"
  | "earring"
  | "pendant"
  | "chain"
  | "coin"
  | "bar"
  | "other";

export type ItemStatus = "available" | "sold" | "reserved" | "repair" | "consignment";

export interface InventoryItem {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  name_ar: string;
  category: ItemCategory;
  karat: GoldKarat;
  weight: number;
  weight_unit: WeightUnit;
  making_charge: number;           // flat amount in tenant currency
  making_charge_per_gram?: number; // alternative per-gram rate
  cost_price: number;
  selling_price: number;
  currency: CurrencyCode;
  status: ItemStatus;
  supplier_id?: string;
  barcode?: string;
  images: string[];                // Storage URLs
  description?: string;
  notes?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export type InvoiceType   = "sale" | "purchase" | "exchange" | "repair";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "gold_exchange" | "mixed";
export type InvoiceStatus = "draft" | "paid" | "partial" | "voided" | "refunded";

export interface InvoiceLineItem {
  item_id:       string;
  sku:           string;
  name_ar:       string;
  karat:         GoldKarat;
  weight:        number;
  weight_unit:   WeightUnit;
  unit_price:    number;
  quantity:      number;
  discount:      number;
  line_total:    number;
}

export interface PaymentRecord {
  method:      PaymentMethod;
  amount:      number;
  reference?:  string;
  paid_at:     Timestamp;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  customer_name?: string;
  customer_phone?: string;
  customer_id?: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  discount_total: number;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  currency: CurrencyCode;
  gold_rate_at_sale: number;       // live gold price per gram at time of sale
  payments: PaymentRecord[];
  cashier_uid: string;
  notes?: string;
  voided_by?: string;
  voided_at?: Timestamp;
  void_reason?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Supplier ─────────────────────────────────────────────────────────────────

export type SupplierStatus = "active" | "inactive" | "blacklisted";

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  name_ar: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  country?: string;
  tax_number?: string;
  status: SupplierStatus;
  total_purchases: number;
  outstanding_balance: number;
  currency: CurrencyCode;
  notes?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Active Offer ─────────────────────────────────────────────────────────────

export type OfferType      = "percentage_discount" | "fixed_discount" | "making_charge_waiver" | "bundle";
export type OfferAppliesTo = "all" | "category" | "specific_items" | "supplier";

export interface OfferCondition {
  min_purchase_amount?: number;
  min_item_count?: number;
  karat?: GoldKarat;
}

export interface ActiveOffer {
  id: string;
  tenant_id: string;
  title: string;
  title_ar: string;
  description_ar?: string;
  type: OfferType;
  applies_to: OfferAppliesTo;
  target_ids: string[];            // category keys, item IDs, or supplier IDs depending on applies_to
  discount_value: number;          // percentage (0–100) or flat amount
  currency?: CurrencyCode;         // required when type is fixed_discount
  conditions: OfferCondition;
  is_active: boolean;
  starts_at: Timestamp;
  ends_at: Timestamp;
  usage_limit?: number;            // max number of times offer can be used; undefined = unlimited
  usage_count: number;
  created_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}
