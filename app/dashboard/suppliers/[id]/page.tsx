"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc, onSnapshot, collection, query,
  orderBy, limit, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { subscribeToGoldPrices, type GoldPrices } from "@/lib/firebase/invoices";
import { SettlementModal } from "@/components/SettlementModal";
import type { Supplier } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id:             string;
  type:           "weight_credit" | "weight_debit" | "cash_credit" | "cash_debit" | "settlement";
  amount?:        number;
  karat?:         number;
  equivalent_21k?: number;
  weight_settled_21k?: number;
  cash_value?:    number;
  weight_delta?:  number;
  cash_delta?:    number;
  price_per_gram_21k?: number;
  reference?:     string;
  notes?:         string;
  performed_by?:  string;
  created_at:     Timestamp;
}

interface SupplierWithBalances extends Supplier {
  weight_balance_21k: number;
  cash_balance:       number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = "demo-tenant";

const ENTRY_META: Record<LedgerEntry["type"], { label: string; color: string; icon: string }> = {
  weight_credit: { label: "إضافة وزن",    color: "text-amber-400  bg-amber-400/10  border-amber-400/20",  icon: "▲" },
  weight_debit:  { label: "خصم وزن",      color: "text-zinc-400   bg-zinc-400/10   border-zinc-400/20",   icon: "▼" },
  cash_credit:   { label: "دفعة نقدية",   color: "text-red-400    bg-red-400/10    border-red-400/20",    icon: "▼" },
  cash_debit:    { label: "استرداد نقدي", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: "▲" },
  settlement:    { label: "تسوية",        color: "text-[#036a71]  bg-[#036a71]/10  border-[#036a71]/20",  icon: "⇄" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  active:      { label: "نشط",      color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  inactive:    { label: "غير نشط",  color: "text-zinc-400   bg-zinc-400/10   border-zinc-400/20"   },
  blacklisted: { label: "محظور",    color: "text-red-400    bg-red-400/10    border-red-400/20"    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString("ar-SA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierLedgerPage() {
  const { id: supplierId } = useParams<{ id: string }>();
  const router             = useRouter();

  const [supplier,       setSupplier]       = useState<SupplierWithBalances | null>(null);
  const [ledgerEntries,  setLedgerEntries]  = useState<LedgerEntry[]>([]);
  const [goldPrices,     setGoldPrices]     = useState<GoldPrices | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [showSettlement, setShowSettlement] = useState(false);
  const [settlementSuccess, setSettlementSuccess] = useState<string | null>(null);

  // ── Supplier subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!supplierId) return;
    return onSnapshot(
      doc(db, "tenants", TENANT_ID, "suppliers", supplierId),
      (snap) => {
        if (snap.exists()) {
          setSupplier({ id: snap.id, ...snap.data() } as SupplierWithBalances);
        }
        setLoading(false);
      }
    );
  }, [supplierId]);

  // ── Ledger entries subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!supplierId) return;
    const q = query(
      collection(db, "tenants", TENANT_ID, "suppliers", supplierId, "ledger_entries"),
      orderBy("created_at", "desc"),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      setLedgerEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
  }, [supplierId]);

  // ── Gold prices subscription ──────────────────────────────────────────────
  useEffect(() => {
    return subscribeToGoldPrices(TENANT_ID, setGoldPrices);
  }, []);

  // ── Settlement success ────────────────────────────────────────────────────
  const handleSettlementSuccess = useCallback((result: {
    new_weight_balance: number;
    new_cash_balance:   number;
    cash_value_settled: number;
  }) => {
    setShowSettlement(false);
    setSettlementSuccess(
      `تمّت التسوية — تم تحويل ${result.cash_value_settled.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${supplier?.currency ?? "SAR"} إلى مديونية نقدية`
    );
    setTimeout(() => setSettlementSuccess(null), 6000);
  }, [supplier]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div dir="rtl" className="flex h-screen items-center justify-center bg-[#0f1117]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#21262d] border-t-[#036a71]" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div dir="rtl" className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0f1117] text-white">
        <p className="text-zinc-400">لم يُعثر على المورّد</p>
        <button onClick={() => router.back()} className="text-sm text-[#036a71] hover:underline">
          العودة
        </button>
      </div>
    );
  }

  const weightBalance = supplier.weight_balance_21k ?? 0;
  const cashBalance   = supplier.cash_balance       ?? 0;
  const canSettle     = weightBalance > 0;

  // Split ledger entries by type
  const weightEntries = ledgerEntries.filter((e) =>
    e.type === "weight_credit" || e.type === "weight_debit" || e.type === "settlement"
  );
  const cashEntries = ledgerEntries.filter((e) =>
    e.type === "cash_credit" || e.type === "cash_debit" || e.type === "settlement"
  );

  return (
    <div dir="rtl" className="min-h-screen bg-[#0f1117] text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-[#21262d] bg-[#0f1117]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg border border-[#21262d] p-2 text-zinc-500 transition hover:border-zinc-500 hover:text-white"
            >
              <svg className="h-4 w-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">{supplier.name_ar}</h1>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_META[supplier.status]?.color ?? ""}`}>
                  {STATUS_META[supplier.status]?.label}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {supplier.contact_person && `${supplier.contact_person} · `}
                {supplier.phone}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSettlement(true)}
            disabled={!canSettle}
            className="flex items-center gap-2 rounded-xl bg-[#036a71] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#025d63] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            تسوية الرصيد
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">

        {/* ── Success toast ─────────────────────────────────────────────────── */}
        {settlementSuccess && (
          <div className="flex items-center gap-3 rounded-xl border border-[#036a71]/40 bg-[#036a71]/10 px-4 py-3 text-sm text-[#036a71]">
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {settlementSuccess}
          </div>
        )}

        {/* ── Dual balance cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* Weight Ledger card */}
          <div className="rounded-2xl border border-amber-500/20 bg-[#161b22] p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-500/60">
                  دفتر الوزن
                </p>
                <p className="mt-1 text-[11px] text-zinc-600">
                  بالمعيار الموحد (21 قيراط)
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              </div>
            </div>

            <p className="mt-4 tabular-nums text-4xl font-bold text-amber-400">
              {weightBalance.toLocaleString("ar-SA", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              <span className="ms-2 text-lg font-normal text-zinc-500">جم</span>
            </p>

            {goldPrices && weightBalance > 0 && (
              <p className="mt-2 text-xs text-zinc-500">
                القيمة التقريبية ≈{" "}
                <span className="font-semibold text-zinc-300">
                  {(weightBalance * goldPrices.price_per_gram_21k).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                </span>{" "}
                {supplier.currency}
              </p>
            )}

            <div className="mt-3 h-px bg-[#21262d]" />
            <p className="mt-2 text-[11px] text-zinc-600">
              {weightEntries.length} قيد · آخر تحديث:{" "}
              {weightEntries[0] ? formatDate(weightEntries[0].created_at) : "—"}
            </p>
          </div>

          {/* Cash Ledger card */}
          <div className={`rounded-2xl border bg-[#161b22] p-6 ${
            cashBalance > 0 ? "border-red-500/20" : "border-[#21262d]"
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest ${
                  cashBalance > 0 ? "text-red-500/60" : "text-zinc-500/60"
                }`}>
                  دفتر النقد
                </p>
                <p className="mt-1 text-[11px] text-zinc-600">
                  مديونية نقدية مستحقة
                </p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                cashBalance > 0 ? "bg-red-500/10" : "bg-[#21262d]"
              }`}>
                <svg className={`h-5 w-5 ${cashBalance > 0 ? "text-red-400" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
            </div>

            <p className={`mt-4 tabular-nums text-4xl font-bold ${
              cashBalance > 0 ? "text-red-400" : "text-emerald-400"
            }`}>
              {cashBalance.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ms-2 text-lg font-normal text-zinc-500">{supplier.currency}</span>
            </p>

            <p className="mt-2 text-[11px] text-zinc-600">
              {cashBalance > 0
                ? "مبلغ مستحق للمورّد"
                : cashBalance < 0
                ? "رصيد دائن للمتجر"
                : "لا توجد مديونية"}
            </p>

            <div className="mt-3 h-px bg-[#21262d]" />
            <p className="mt-2 text-[11px] text-zinc-600">
              {cashEntries.length} قيد · آخر تحديث:{" "}
              {cashEntries[0] ? formatDate(cashEntries[0].created_at) : "—"}
            </p>
          </div>
        </div>

        {/* ── Ledger tables ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Weight ledger */}
          <LedgerTable
            title="سجل دفتر الوزن"
            entries={weightEntries}
            type="weight"
            currency={supplier.currency}
          />

          {/* Cash ledger */}
          <LedgerTable
            title="سجل دفتر النقد"
            entries={cashEntries}
            type="cash"
            currency={supplier.currency}
          />
        </div>
      </div>

      {/* ── Settlement modal ──────────────────────────────────────────────────── */}
      {showSettlement && (
        <SettlementModal
          tenantId={TENANT_ID}
          supplierId={supplierId}
          supplierName={supplier.name_ar}
          weightBalance21k={weightBalance}
          currentPrice21k={goldPrices?.price_per_gram_21k ?? 0}
          currency={supplier.currency}
          onClose={() => setShowSettlement(false)}
          onSuccess={handleSettlementSuccess}
        />
      )}
    </div>
  );
}

// ─── LedgerTable ──────────────────────────────────────────────────────────────

function LedgerTable({
  title, entries, type, currency,
}: {
  title:    string;
  entries:  LedgerEntry[];
  type:     "weight" | "cash";
  currency: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#21262d]">
      <div className="border-b border-[#21262d] bg-[#161b22] px-5 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>

      {entries.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-zinc-600 bg-[#0f1117]">
          لا توجد قيود بعد
        </div>
      ) : (
        <div className="overflow-y-auto max-h-96 bg-[#0f1117]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d1117]">
              <tr className="border-b border-[#21262d] text-[11px] text-zinc-500">
                <th className="px-4 py-2.5 text-right font-medium">النوع</th>
                <th className="px-4 py-2.5 text-right font-medium">القيمة</th>
                <th className="px-4 py-2.5 text-right font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262d]">
              {entries.map((entry) => {
                const meta   = ENTRY_META[entry.type];
                const amount = type === "weight"
                  ? (entry.weight_settled_21k ?? entry.equivalent_21k ?? Math.abs(entry.weight_delta ?? 0))
                  : (entry.cash_value ?? Math.abs(entry.cash_delta ?? 0));
                const isDebit = type === "weight"
                  ? (entry.type === "weight_debit")
                  : (entry.type === "cash_credit" || (entry.type === "settlement" && (entry.cash_delta ?? 0) > 0));

                return (
                  <tr key={entry.id} className="hover:bg-[#161b22]/50 transition">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                        <span>{meta.icon}</span>
                        {meta.label}
                      </span>
                      {entry.reference && (
                        <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{entry.reference}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={isDebit ? "text-red-400" : "text-emerald-400"}>
                        {isDebit ? "-" : "+"}
                        {amount.toLocaleString("ar-SA", { minimumFractionDigits: type === "weight" ? 3 : 2 })}
                      </span>
                      <span className="ms-1 text-[11px] text-zinc-600">
                        {type === "weight" ? "جم (21)" : currency}
                      </span>
                      {entry.type === "settlement" && entry.price_per_gram_21k && (
                        <p className="text-[10px] text-zinc-600">
                          @ {entry.price_per_gram_21k.toLocaleString("ar-SA")} {currency}/جم
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-zinc-500">
                      {formatDate(entry.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
