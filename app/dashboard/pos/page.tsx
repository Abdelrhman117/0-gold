"use client";

import {
  useState, useEffect, useCallback, useRef, useMemo, useId,
} from "react";
import Image from "next/image";
import { onSnapshot, query, collection, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { LivePriceHeader } from "@/components/LivePriceHeader";
import {
  lookupInventoryItem,
  createInvoice,
  type CartLineItem,
  type ScrapGoldEntry,
  type GoldPrices,
} from "@/lib/firebase/invoices";
import type {
  InventoryItem, ActiveOffer, GoldKarat, WeightUnit, PaymentMethod, CurrencyCode,
} from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID  = "demo-tenant";
const CASHIER_UID= "demo-cashier";
const CURRENCY: CurrencyCode = "SAR";

const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: "gram",  label: "جرام" },
  { value: "tola",  label: "تولة" },
  { value: "ounce", label: "أوقية" },
];

const OFFER_TYPE_LABELS: Record<string, string> = {
  percentage_discount:    "خصم ٪",
  fixed_discount:         "خصم ثابت",
  making_charge_waiver:   "إعفاء أجرة",
  bundle:                 "حزمة",
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function priceForKarat(karat: GoldKarat, prices: GoldPrices | null): number {
  if (!prices) return 0;
  if (karat === 24) return prices.price_per_gram_24k;
  if (karat === 21) return prices.price_per_gram_21k;
  if (karat === 18) return prices.price_per_gram_18k;
  return prices.price_per_gram_21k * (karat / 21);
}

function calcLineTotal(item: InventoryItem & { net_weight?: number }, gramPrice: number): number {
  const goldWeight = (item.net_weight ?? 0) > 0 ? item.net_weight! : item.weight;
  return parseFloat((goldWeight * gramPrice + (item.making_charge ?? 0)).toFixed(2));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
      {children}
    </h3>
  );
}

function NumInput({
  value, onChange, placeholder, min = 0, step = "0.01", highlight,
}: {
  value: number; onChange: (v: number) => void; placeholder?: string;
  min?: number; step?: string; highlight?: boolean;
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value || ""}
      placeholder={placeholder ?? "0.00"}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={`w-full rounded-xl border bg-[#0f1117] px-3 py-2 text-sm text-white tabular-nums outline-none transition
        placeholder-zinc-600 focus:ring-1
        ${highlight
          ? "border-[#036a71]/50 focus:border-[#036a71] focus:ring-[#036a71]"
          : "border-[#21262d] focus:border-[#036a71]/60 focus:ring-[#036a71]/40"
        }`}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function POSPage() {
  // ── Prices ────────────────────────────────────────────────────────────────
  const [goldPrices, setGoldPrices] = useState<GoldPrices | null>(null);

  // ── Scanner ────────────────────────────────────────────────────────────────
  const [scanInput,    setScanInput]    = useState("");
  const [isLookingUp,  setIsLookingUp]  = useState(false);
  const [lookupError,  setLookupError]  = useState<string | null>(null);
  const [pendingItem,  setPendingItem]  = useState<(InventoryItem & { net_weight?: number }) | null>(null);
  const [agreedPrice,  setAgreedPrice]  = useState(0);
  const scanInputRef                    = useRef<HTMLInputElement>(null);

  // ── Cart ───────────────────────────────────────────────────────────────────
  const [cartItems,  setCartItems]  = useState<CartLineItem[]>([]);

  // ── Scrap gold ─────────────────────────────────────────────────────────────
  const [scrapItems,  setScrapItems]  = useState<ScrapGoldEntry[]>([]);
  const [scrapWeight, setScrapWeight] = useState(0);
  const [scrapKarat,  setScrapKarat]  = useState<GoldKarat>(18);
  const [scrapUnit,   setScrapUnit]   = useState<WeightUnit>("gram");
  const [scrapPrice,  setScrapPrice]  = useState(0);
  const [showScrap,   setShowScrap]   = useState(false);
  const scrapId = useId();

  // ── Offers ─────────────────────────────────────────────────────────────────
  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);

  // ── Payment ────────────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived,  setCashReceived]  = useState(0);
  const [cardAmount,    setCardAmount]    = useState(0);
  const [discount,      setDiscount]      = useState(0);
  const [customerName,  setCustomerName]  = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes,         setNotes]         = useState("");

  // ── Checkout ───────────────────────────────────────────────────────────────
  const [isCheckingOut,    setIsCheckingOut]    = useState(false);
  const [checkoutError,    setCheckoutError]    = useState<string | null>(null);
  const [completedInvoice, setCompletedInvoice] = useState<{
    id: string; number: string; queued: boolean;
  } | null>(null);

  // ── Totals (derived) ───────────────────────────────────────────────────────
  const subtotal       = useMemo(() => cartItems.reduce((s, i) => s + i.line_total, 0), [cartItems]);
  const scrapDeduction = useMemo(() => scrapItems.reduce((s, e) => s + e.total_value, 0), [scrapItems]);
  const grandTotal     = useMemo(() => Math.max(0, subtotal - scrapDeduction - discount), [subtotal, scrapDeduction, discount]);
  const totalPaid      = useMemo(() => cashReceived + cardAmount, [cashReceived, cardAmount]);
  const changeDue      = useMemo(() => Math.max(0, totalPaid - grandTotal), [totalPaid, grandTotal]);
  const balanceDue     = useMemo(() => Math.max(0, grandTotal - totalPaid), [grandTotal, totalPaid]);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  useEffect(() => {
    const now = new Date();
    const q   = query(
      collection(db, "tenants", TENANT_ID, "offers"),
      where("is_active", "==", true)
    );
    return onSnapshot(q, (snap) => {
      const offers = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ActiveOffer))
        .filter((o) => o.ends_at.toDate() > now && o.starts_at.toDate() <= now);
      setActiveOffers(offers);
    });
  }, []);

  // Auto-focus scanner input on mount and after item added.
  useEffect(() => { scanInputRef.current?.focus(); }, []);

  // ── Scanner logic ──────────────────────────────────────────────────────────
  const handleScan = useCallback(async (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    setScanInput("");
    setLookupError(null);
    setIsLookingUp(true);
    setPendingItem(null);

    try {
      const item = await lookupInventoryItem(TENANT_ID, input);
      if (!item) {
        setLookupError("لم يُعثر على هذا الكود في المخزون");
        return;
      }
      if (item.status !== "available") {
        setLookupError(`هذه القطعة غير متاحة — الحالة: ${item.status}`);
        return;
      }
      if (cartItems.some((c) => c.inventory_item.id === item.id)) {
        setLookupError("القطعة موجودة بالفعل في سلة الفاتورة");
        return;
      }
      setPendingItem(item);
      setAgreedPrice(priceForKarat(item.karat, goldPrices));
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setIsLookingUp(false);
    }
  }, [cartItems, goldPrices]);

  const addToCart = useCallback(() => {
    if (!pendingItem || agreedPrice <= 0) return;
    const line_total = calcLineTotal(pendingItem, agreedPrice);
    setCartItems((prev) => [...prev, {
      inventory_item:    pendingItem,
      agreed_gram_price: agreedPrice,
      line_total,
    }]);
    setPendingItem(null);
    setAgreedPrice(0);
    setLookupError(null);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }, [pendingItem, agreedPrice]);

  const removeFromCart = useCallback((itemId: string) => {
    setCartItems((prev) => prev.filter((c) => c.inventory_item.id !== itemId));
  }, []);

  // ── Scrap gold logic ───────────────────────────────────────────────────────
  const addScrap = useCallback(() => {
    if (scrapWeight <= 0 || scrapPrice <= 0) return;
    const entry: ScrapGoldEntry = {
      id:                    `${scrapId}-${Date.now()}`,
      karat:                 scrapKarat,
      weight:                scrapWeight,
      weight_unit:           scrapUnit,
      buying_price_per_gram: scrapPrice,
      total_value:           parseFloat((scrapWeight * scrapPrice).toFixed(2)),
    };
    setScrapItems((prev) => [...prev, entry]);
    setScrapWeight(0);
    setScrapPrice(0);
  }, [scrapWeight, scrapKarat, scrapUnit, scrapPrice, scrapId]);

  // ── Checkout ───────────────────────────────────────────────────────────────
  const handleCheckout = useCallback(async () => {
    if (cartItems.length === 0) return;
    setCheckoutError(null);
    setIsCheckingOut(true);
    try {
      const result = await createInvoice(TENANT_ID, {
        cart_items:        cartItems,
        scrap_items:       scrapItems,
        cashier_uid:       CASHIER_UID,
        gold_rate_at_sale: goldPrices?.price_per_gram_21k ?? 0,
        payment_method:    paymentMethod,
        cash_received:     cashReceived,
        card_amount:       cardAmount,
        discount,
        currency:          CURRENCY,
        customer_name:     customerName || undefined,
        customer_phone:    customerPhone || undefined,
        notes:             notes || undefined,
      });
      setCompletedInvoice({
        id:     result.invoice_id,
        number: result.invoice_number,
        queued: result.queued_offline,
      });
    } catch (err) {
      setCheckoutError((err as Error).message);
    } finally {
      setIsCheckingOut(false);
    }
  }, [cartItems, scrapItems, goldPrices, paymentMethod, cashReceived, cardAmount, discount, customerName, customerPhone, notes]);

  const resetPOS = useCallback(() => {
    setCartItems([]); setScrapItems([]); setPendingItem(null);
    setDiscount(0); setCashReceived(0); setCardAmount(0);
    setCustomerName(""); setCustomerPhone(""); setNotes("");
    setPaymentMethod("cash"); setCompletedInvoice(null); setCheckoutError(null);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  }, []);

  // ── Keyboard: F2 refocuses scanner ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); scanInputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ── Success screen ────────────────────────────────────────────────────────
  if (completedInvoice) {
    return (
      <div dir="rtl" className="flex h-screen flex-col items-center justify-center gap-6 bg-[#0f1117] text-white">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#036a71]/20 ring-4 ring-[#036a71]/30">
          <svg className="h-10 w-10 text-[#036a71]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold">تمّت عملية البيع</h1>
          <p className="mt-1 text-zinc-400">رقم الفاتورة: <span className="font-mono font-semibold text-white">{completedInvoice.number}</span></p>
          {completedInvoice.queued && (
            <p className="mt-2 text-xs text-amber-400">⚠ تم حفظ الفاتورة محلياً وستُرفع عند استعادة الاتصال</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="rounded-xl border border-[#21262d] px-5 py-2.5 text-sm text-zinc-300 hover:border-[#036a71]/40 hover:text-white transition">
            طباعة الفاتورة
          </button>
          <button onClick={resetPOS} className="rounded-xl bg-[#036a71] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#025d63] transition">
            فاتورة جديدة
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── Main POS layout ───────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="flex h-screen flex-col overflow-hidden bg-[#0f1117] text-white">

      {/* ── Top bar: live prices ───────────────────────────────────────────── */}
      <LivePriceHeader tenantId={TENANT_ID} onPricesUpdate={setGoldPrices} compact />

      {/* ── Split body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ══════════════════════════════════════════════════════════════════
            RIGHT PANEL — Cart + Totals + Payment  (380px, RTL = right side)
        ═══════════════════════════════════════════════════════════════════ */}
        <aside className="flex w-[380px] shrink-0 flex-col border-s border-[#21262d] bg-[#0d1117]">

          {/* Cart header */}
          <div className="flex items-center justify-between border-b border-[#21262d] px-4 py-3">
            <h2 className="text-sm font-bold">سلة الفاتورة</h2>
            {cartItems.length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#036a71] text-[11px] font-bold">
                {cartItems.length}
              </span>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#161b22] border border-[#21262d]">
                  <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                </div>
                <p className="text-xs text-zinc-600">لم تُضَف قطع بعد</p>
              </div>
            ) : (
              cartItems.map((ci) => (
                <CartItemRow key={ci.inventory_item.id} item={ci} currency={CURRENCY} onRemove={removeFromCart} />
              ))
            )}

            {/* ── Scrap gold section ─────────────────────────────────────── */}
            <div className="mt-2 rounded-xl border border-[#21262d] bg-[#161b22]">
              <button
                onClick={() => setShowScrap((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-white transition"
              >
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                  الذهب الخردة
                  {scrapItems.length > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-400">
                      -{scrapDeduction.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </span>
                <svg className={`h-4 w-4 transition-transform ${showScrap ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {showScrap && (
                <div className="border-t border-[#21262d] px-4 pb-4 pt-3 space-y-3">
                  {scrapItems.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{s.weight}{s.weight_unit} × {s.karat}K</span>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 tabular-nums">
                          -{s.total_value.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        </span>
                        <button onClick={() => setScrapItems((p) => p.filter((x) => x.id !== s.id))}
                          className="text-zinc-600 hover:text-red-400 transition">×</button>
                      </div>
                    </div>
                  ))}

                  {/* Add scrap form */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="col-span-2 grid grid-cols-3 gap-2">
                      <NumInput value={scrapWeight} onChange={setScrapWeight} placeholder="الوزن" />
                      <select
                        className="rounded-xl border border-[#21262d] bg-[#0f1117] px-2 py-2 text-xs text-white outline-none focus:border-[#036a71]"
                        value={scrapKarat}
                        onChange={(e) => setScrapKarat(Number(e.target.value) as GoldKarat)}
                      >
                        {([24,22,21,18,14] as GoldKarat[]).map((k) => (
                          <option key={k} value={k}>{k}K</option>
                        ))}
                      </select>
                      <select
                        className="rounded-xl border border-[#21262d] bg-[#0f1117] px-2 py-2 text-xs text-white outline-none focus:border-[#036a71]"
                        value={scrapUnit}
                        onChange={(e) => setScrapUnit(e.target.value as WeightUnit)}
                      >
                        {WEIGHT_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                    <NumInput value={scrapPrice} onChange={setScrapPrice} placeholder="سعر شراء/جم" />
                    <button
                      onClick={addScrap}
                      disabled={scrapWeight <= 0 || scrapPrice <= 0}
                      className="rounded-xl bg-amber-600/20 py-2 text-xs font-semibold text-amber-400 transition hover:bg-amber-600/30 disabled:opacity-40"
                    >
                      إضافة
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Totals ────────────────────────────────────────────────────── */}
          <div className="border-t border-[#21262d] px-4 py-3 space-y-2 text-sm">
            <TotalRow label="الإجمالي"       value={subtotal}       currency={CURRENCY} />
            {scrapDeduction > 0 && (
              <TotalRow label="خصم الخردة"   value={-scrapDeduction} currency={CURRENCY} colored />
            )}
            {discount > 0 && (
              <TotalRow label="خصم إضافي"    value={-discount}       currency={CURRENCY} colored />
            )}
            <div className="my-1 border-t border-dashed border-[#21262d]" />
            <TotalRow label="الصافي"         value={grandTotal}      currency={CURRENCY} bold />
          </div>

          {/* ── Payment section ───────────────────────────────────────────── */}
          <div className="border-t border-[#21262d] px-4 py-3 space-y-3">
            {/* Payment method tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#21262d] p-1">
              {(["cash", "card", "mixed"] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg py-1.5 text-[11px] font-medium transition ${
                    paymentMethod === m ? "bg-[#036a71] text-white" : "text-zinc-500 hover:text-white"
                  }`}
                >
                  {m === "cash" ? "نقد" : m === "card" ? "بطاقة" : "مختلط"}
                </button>
              ))}
            </div>

            {(paymentMethod === "cash" || paymentMethod === "mixed") && (
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-zinc-500">نقد مستلم</span>
                <NumInput value={cashReceived} onChange={setCashReceived} highlight />
              </div>
            )}
            {(paymentMethod === "card" || paymentMethod === "mixed") && (
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-zinc-500">مبلغ البطاقة</span>
                <NumInput value={cardAmount} onChange={setCardAmount} highlight />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-zinc-500">خصم</span>
              <NumInput value={discount} onChange={setDiscount} />
            </div>

            {changeDue > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-emerald-400/10 px-3 py-2">
                <span className="text-xs text-emerald-400">الباقي للعميل</span>
                <span className="tabular-nums text-sm font-bold text-emerald-400">
                  {changeDue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} {CURRENCY}
                </span>
              </div>
            )}
            {balanceDue > 0 && totalPaid > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-red-500/10 px-3 py-2">
                <span className="text-xs text-red-400">متبقي على العميل</span>
                <span className="tabular-nums text-sm font-bold text-red-400">
                  {balanceDue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} {CURRENCY}
                </span>
              </div>
            )}
          </div>

          {/* ── Checkout ──────────────────────────────────────────────────── */}
          {checkoutError && (
            <p className="mx-4 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {checkoutError}
            </p>
          )}
          <div className="border-t border-[#21262d] px-4 py-3">
            <button
              onClick={handleCheckout}
              disabled={cartItems.length === 0 || isCheckingOut}
              className="w-full rounded-xl bg-[#036a71] py-3.5 text-sm font-bold text-white transition hover:bg-[#025d63] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCheckingOut
                ? "جارٍ المعالجة..."
                : `تأكيد البيع — ${grandTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${CURRENCY}`}
            </button>
          </div>
        </aside>

        {/* ══════════════════════════════════════════════════════════════════
            LEFT PANEL — Scanner + Item details + Active Offers
        ═══════════════════════════════════════════════════════════════════ */}
        <main className="flex flex-1 flex-col overflow-hidden">

          {/* ── QR Scanner ────────────────────────────────────────────────── */}
          <div className="border-b border-[#21262d] bg-[#0f1117] px-6 py-4">
            <div className="relative">
              {/* QR icon */}
              <div className="pointer-events-none absolute inset-y-0 end-4 flex items-center">
                {isLookingUp ? (
                  <svg className="h-5 w-5 animate-spin text-[#036a71]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zm0 9.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zm9.75-9.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zm0 9.75h.75v.75h-.75v-.75zm9.75-9.75h.75v.75h-.75v-.75zm-9 4.5H6v.75h.75v-.75zm2.25 0H9v.75h.75v-.75zM6.75 18h.75v.75h-.75V18zm2.25 0H9v.75h.75V18zm2.25-2.25h.75v.75H11.25v-.75zm0 2.25h.75v.75H11.25V18zm2.25-4.5h.75V15H13.5v-.75zm0 4.5h.75v.75H13.5V18zm2.25-4.5h.75V15h-.75v-.75zm0 2.25h.75v2.25h-.75v-2.25z" />
                  </svg>
                )}
              </div>
              <input
                ref={scanInputRef}
                type="text"
                dir="ltr"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan(scanInput)}
                placeholder="امسح كود QR أو أدخل رقم SKU ثم Enter — (F2 للتركيز)"
                className="w-full rounded-2xl border border-[#21262d] bg-[#161b22] px-4 py-3.5 pe-12 text-sm font-mono text-white placeholder-zinc-600 outline-none transition focus:border-[#036a71] focus:ring-2 focus:ring-[#036a71]/30"
              />
            </div>
            {lookupError && (
              <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {lookupError}
              </p>
            )}
          </div>

          {/* ── Scrollable content ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* ── Pending item card ──────────────────────────────────────── */}
            {pendingItem && (
              <div className="rounded-2xl border border-[#036a71]/40 bg-[#161b22] p-5 shadow-lg shadow-[#036a71]/5">
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[#21262d] bg-[#0f1117]">
                    {pendingItem.images?.[0] ? (
                      <Image src={pendingItem.images[0]} alt="" fill className="object-cover" sizes="96px" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-700">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <p className="truncate font-semibold text-white">{pendingItem.name_ar || "—"}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                        <span className="rounded bg-[#036a71]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#036a71]">
                          {pendingItem.karat}K
                        </span>
                        <span>{pendingItem.weight} {pendingItem.weight_unit}</span>
                        {(pendingItem.net_weight ?? 0) > 0 && (
                          <span className="text-zinc-600">صافي: {pendingItem.net_weight}</span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{pendingItem.sku}</p>
                    </div>
                    <p className="text-xs text-zinc-500">
                      أجرة الصنعة: {pendingItem.making_charge?.toLocaleString("ar-SA") ?? 0} {CURRENCY}
                    </p>
                  </div>
                </div>

                {/* Price lock */}
                <div className="mt-4 rounded-xl border border-[#21262d] bg-[#0f1117] p-4">
                  <p className="mb-2 text-xs font-semibold text-zinc-400">سعر الجرام المتفق عليه</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={agreedPrice || ""}
                      onChange={(e) => setAgreedPrice(parseFloat(e.target.value) || 0)}
                      className="flex-1 rounded-xl border border-[#036a71]/50 bg-[#161b22] px-3 py-2.5 text-center text-lg font-bold text-white tabular-nums outline-none focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
                      placeholder="0.00"
                      autoFocus
                    />
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-600">إجمالي القطعة</p>
                      <p className="tabular-nums text-sm font-bold text-white">
                        {calcLineTotal(pendingItem, agreedPrice).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                        <span className="ms-1 text-xs font-normal text-zinc-500">{CURRENCY}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => { setPendingItem(null); setLookupError(null); scanInputRef.current?.focus(); }}
                    className="rounded-xl border border-[#21262d] px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={addToCart}
                    disabled={agreedPrice <= 0}
                    className="flex-1 rounded-xl bg-[#036a71] py-2.5 text-sm font-bold text-white transition hover:bg-[#025d63] disabled:opacity-50"
                  >
                    إضافة إلى السلة
                  </button>
                </div>
              </div>
            )}

            {/* ── Customer info (collapsible) ────────────────────────────── */}
            <details className="rounded-2xl border border-[#21262d] bg-[#161b22]">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-medium text-zinc-500 hover:text-white transition">
                ▸ بيانات العميل (اختياري)
              </summary>
              <div className="grid grid-cols-2 gap-3 border-t border-[#21262d] px-4 pb-4 pt-3">
                <input
                  className="rounded-xl border border-[#21262d] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#036a71]"
                  placeholder="اسم العميل"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                <input
                  className="rounded-xl border border-[#21262d] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#036a71]"
                  placeholder="رقم الجوال"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
                <div className="col-span-2">
                  <input
                    className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#036a71]"
                    placeholder="ملاحظات على الفاتورة"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </details>

            {/* ── Active Offers ──────────────────────────────────────────── */}
            {activeOffers.length > 0 && (
              <div className="rounded-2xl border border-[#036a71]/20 bg-[#036a71]/5">
                <div className="flex items-center gap-2 border-b border-[#036a71]/20 px-4 py-3">
                  <svg className="h-4 w-4 text-[#036a71]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                  </svg>
                  <SectionTitle>العروض الفعّالة الآن</SectionTitle>
                </div>
                <div className="divide-y divide-[#036a71]/10">
                  {activeOffers.map((offer) => (
                    <OfferRow key={offer.id} offer={offer} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── CartItemRow ──────────────────────────────────────────────────────────────

function CartItemRow({
  item, currency, onRemove,
}: {
  item: CartLineItem; currency: CurrencyCode; onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#21262d] bg-[#161b22] p-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#21262d]">
        {item.inventory_item.images?.[0] ? (
          <Image src={item.inventory_item.images[0]} alt="" fill className="object-cover" sizes="48px" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#0f1117]">
            <span className="text-[10px] font-bold text-zinc-600">{item.inventory_item.karat}K</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-semibold text-white">{item.inventory_item.name_ar || "—"}</p>
        <p className="text-[10px] text-zinc-500">
          {item.inventory_item.weight}{item.inventory_item.weight_unit} ×{" "}
          {item.agreed_gram_price.toLocaleString("ar-SA")}/{item.inventory_item.weight_unit}
        </p>
      </div>
      <div className="text-left shrink-0">
        <p className="tabular-nums text-sm font-bold text-white">
          {item.line_total.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[10px] text-zinc-600">{currency}</p>
      </div>
      <button
        onClick={() => onRemove(item.inventory_item.id)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400"
      >
        ×
      </button>
    </div>
  );
}

// ─── TotalRow ─────────────────────────────────────────────────────────────────

function TotalRow({
  label, value, currency, bold, colored,
}: {
  label: string; value: number; currency: CurrencyCode; bold?: boolean; colored?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold text-white" : "text-zinc-500 text-xs"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "text-base font-bold text-white" : "text-sm"} ${
          colored ? (isNeg ? "text-emerald-400" : "text-red-400") : ""
        }`}
      >
        {isNeg ? "-" : ""}
        {Math.abs(value).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
        <span className="ms-1 text-[11px] font-normal text-zinc-600">{currency}</span>
      </span>
    </div>
  );
}

// ─── OfferRow ─────────────────────────────────────────────────────────────────

function OfferRow({ offer }: { offer: ActiveOffer }) {
  const until = offer.ends_at.toDate().toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{offer.title_ar}</p>
        {offer.description_ar && (
          <p className="mt-0.5 text-xs text-zinc-500">{offer.description_ar}</p>
        )}
        <p className="mt-0.5 text-[10px] text-zinc-600">حتى {until}</p>
      </div>
      <div className="shrink-0 rounded-lg bg-[#036a71]/20 px-3 py-1.5 text-center">
        <p className="text-xs font-bold text-[#036a71]">
          {offer.type === "percentage_discount"
            ? `${offer.discount_value}٪`
            : `${offer.discount_value} ${offer.currency ?? ""}`}
        </p>
        <p className="text-[10px] text-zinc-600">{OFFER_TYPE_LABELS[offer.type] ?? offer.type}</p>
      </div>
    </div>
  );
}
