"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { subscribeToInventory } from "@/lib/firebase/inventory";
import { PrintableTicket } from "@/components/PrintableTicket";
import type { InventoryItem, GoldKarat, ItemCategory, ItemStatus } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = "demo-tenant"; // replaced with useAuth() in production
const SHOP_NAME = "متجر الذهب";

const STATUS_META: Record<ItemStatus, { label: string; color: string }> = {
  available:   { label: "متاح",       color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  sold:        { label: "مباع",        color: "text-zinc-400   bg-zinc-400/10   border-zinc-400/20"   },
  reserved:    { label: "محجوز",      color: "text-amber-400  bg-amber-400/10  border-amber-400/20"  },
  repair:      { label: "في الإصلاح", color: "text-blue-400   bg-blue-400/10   border-blue-400/20"   },
  consignment: { label: "أمانة",      color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
};

const CATEGORY_LABELS: Record<string, string> = {
  ring: "خاتم", necklace: "عقد", bracelet: "سوار", earring: "حلق",
  pendant: "دلاية", chain: "سلسلة", coin: "عملة", bar: "سبيكة", other: "أخرى",
};

type ExtendedItem = InventoryItem & { net_weight?: number };
type ViewMode     = "grid" | "table";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items,      setItems]      = useState<ExtendedItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterKarat,   setFilterKarat]   = useState<GoldKarat | "">("");
  const [filterStatus,  setFilterStatus]  = useState<ItemStatus | "">("");
  const [filterCategory,setFilterCategory]= useState<ItemCategory | "">("");
  const [viewMode,   setViewMode]   = useState<ViewMode>("grid");
  const [ticketItem, setTicketItem] = useState<ExtendedItem | null>(null);

  // ── Real-time subscription ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToInventory(TENANT_ID, (data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const stats = {
    total:     items.length,
    available: items.filter((i) => i.status === "available").length,
    sold:      items.filter((i) => i.status === "sold").length,
    reserved:  items.filter((i) => i.status === "reserved").length,
    totalWeight: items
      .filter((i) => i.weight_unit === "gram")
      .reduce((sum, i) => sum + i.weight, 0),
  };

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = items.filter((item) => {
    if (filterKarat    && item.karat    !== filterKarat)    return false;
    if (filterStatus   && item.status   !== filterStatus)   return false;
    if (filterCategory && item.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name_ar?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q)    ||
        item.sku?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const clearFilters = useCallback(() => {
    setSearch(""); setFilterKarat(""); setFilterStatus(""); setFilterCategory("");
  }, []);

  const hasFilters = search || filterKarat || filterStatus || filterCategory;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-[#0f1117] text-white">

      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#21262d] bg-[#0f1117]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs text-zinc-500">لوحة التحكم</p>
            <h1 className="text-lg font-bold">المخزون</h1>
          </div>
          <Link
            href="/dashboard/inventory/add"
            className="flex items-center gap-2 rounded-xl bg-[#036a71] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#025d63]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            إضافة قطعة
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard label="إجمالي القطع"   value={stats.total}      />
          <StatCard label="متاح"           value={stats.available}  color="text-emerald-400" />
          <StatCard label="مباع"           value={stats.sold}       color="text-zinc-400" />
          <StatCard label="محجوز"          value={stats.reserved}   color="text-amber-400" />
          <StatCard
            label="وزن المتاح (جم)"
            value={stats.totalWeight.toFixed(2)}
            color="text-[#036a71]"
            className="col-span-2 sm:col-span-4 lg:col-span-1"
          />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              className="w-full rounded-xl border border-[#21262d] bg-[#161b22] py-2.5 pe-10 ps-4 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
              placeholder="بحث بالاسم أو SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Karat filter */}
          <select
            className="rounded-xl border border-[#21262d] bg-[#161b22] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#036a71]"
            value={filterKarat}
            onChange={(e) => setFilterKarat(e.target.value ? (Number(e.target.value) as GoldKarat) : "")}
          >
            <option value="">كل العيارات</option>
            {([24,22,21,18,14,10,9] as GoldKarat[]).map((k) => (
              <option key={k} value={k}>{k} قيراط</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="rounded-xl border border-[#21262d] bg-[#161b22] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#036a71]"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ItemStatus | "")}
          >
            <option value="">كل الحالات</option>
            {(Object.keys(STATUS_META) as ItemStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>

          {/* Category filter */}
          <select
            className="rounded-xl border border-[#21262d] bg-[#161b22] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#036a71]"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ItemCategory | "")}
          >
            <option value="">كل التصنيفات</option>
            {(Object.entries(CATEGORY_LABELS)).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-xl border border-[#21262d] px-3 py-2.5 text-sm text-zinc-400 transition hover:border-red-500/40 hover:text-red-400"
            >
              مسح
            </button>
          )}

          {/* View toggle */}
          <div className="me-auto flex rounded-xl border border-[#21262d] p-1">
            {(["grid", "table"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  viewMode === v
                    ? "bg-[#036a71] text-white"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                {v === "grid" ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zm9.75-9.75A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zm0 9.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-zinc-500">
          {filtered.length} قطعة{hasFilters ? " (مفلترة)" : ""}
        </p>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-[#21262d] bg-[#161b22]">
                <div className="aspect-square bg-[#21262d] rounded-t-2xl" />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-[#21262d]" />
                  <div className="h-3 w-1/2 rounded bg-[#21262d]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#161b22] border border-[#21262d]">
              <svg className="h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300">
                {hasFilters ? "لا توجد نتائج مطابقة" : "المخزون فارغ"}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                {hasFilters ? "جرب تعديل الفلاتر" : "ابدأ بإضافة أول قطعة"}
              </p>
            </div>
            {!hasFilters && (
              <Link
                href="/dashboard/inventory/add"
                className="rounded-xl bg-[#036a71] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#025d63]"
              >
                إضافة قطعة
              </Link>
            )}
          </div>
        )}

        {/* ── Grid view ─────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onPrint={() => setTicketItem(item)}
              />
            ))}
          </div>
        )}

        {/* ── Table view ────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && viewMode === "table" && (
          <div className="overflow-x-auto rounded-2xl border border-[#21262d]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21262d] bg-[#161b22] text-xs text-zinc-500">
                  <th className="px-4 py-3 text-right font-medium">الصورة</th>
                  <th className="px-4 py-3 text-right font-medium">الاسم / SKU</th>
                  <th className="px-4 py-3 text-right font-medium">التصنيف</th>
                  <th className="px-4 py-3 text-right font-medium">العيار</th>
                  <th className="px-4 py-3 text-right font-medium">الوزن</th>
                  <th className="px-4 py-3 text-right font-medium">سعر البيع</th>
                  <th className="px-4 py-3 text-right font-medium">الحالة</th>
                  <th className="px-4 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`border-b border-[#21262d] transition hover:bg-[#1c2128] ${
                      idx % 2 === 0 ? "bg-[#0f1117]" : "bg-[#161b22]/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-[#21262d] bg-[#161b22]">
                        {item.images?.[0] ? (
                          <Image
                            src={item.images[0]}
                            alt={item.name_ar}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <GoldPlaceholder />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{item.name_ar || "—"}</p>
                      <p className="font-mono text-[10px] text-zinc-500">{item.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[#036a71]/15 px-2 py-0.5 text-xs font-bold text-[#036a71]">
                        {item.karat}K
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {item.weight} {item.weight_unit}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {item.selling_price
                        ? `${item.selling_price.toLocaleString("ar-SA")} ${item.currency}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setTicketItem(item)}
                        className="rounded-lg border border-[#21262d] px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-[#036a71]/50 hover:text-[#036a71]"
                      >
                        طباعة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ticket overlay */}
      {ticketItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 print:bg-white print:p-0"
          onClick={() => setTicketItem(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="space-y-4 print:space-y-0">
            <PrintableTicket item={ticketItem} shopName={SHOP_NAME} />
            <div className="flex gap-3 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex-1 rounded-xl bg-[#036a71] py-3 text-sm font-semibold text-white transition hover:bg-[#025d63]"
              >
                طباعة
              </button>
              <button
                onClick={() => setTicketItem(null)}
                className="flex-1 rounded-xl border border-[#21262d] py-3 text-sm font-semibold text-zinc-300 transition hover:border-[#036a71] hover:text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemCard({
  item,
  onPrint,
}: {
  item:    ExtendedItem;
  onPrint: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#21262d] bg-[#161b22] transition hover:border-[#036a71]/40 hover:shadow-lg hover:shadow-[#036a71]/5">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-[#0f1117]">
        {item.images?.[0] ? (
          <Image
            src={item.images[0]}
            alt={item.name_ar}
            fill
            className="object-cover transition duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <GoldPlaceholder large />
          </div>
        )}

        {/* Status badge */}
        <div className="absolute left-2 top-2">
          <StatusBadge status={item.status} />
        </div>

        {/* Print button on hover */}
        <button
          onClick={onPrint}
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur-sm transition hover:bg-[#036a71] group-hover:opacity-100"
          title="طباعة البطاقة"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-white">
          {item.name_ar || CATEGORY_LABELS[item.category] || "—"}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded bg-[#036a71]/15 px-1.5 py-0.5 text-[11px] font-bold text-[#036a71]">
            {item.karat}K
          </span>
          <span className="text-xs text-zinc-500">
            {item.weight} {item.weight_unit}
          </span>
        </div>
        {item.selling_price > 0 && (
          <p className="mt-2 text-sm font-bold text-white">
            {item.selling_price.toLocaleString("ar-SA")}
            <span className="ms-1 text-xs font-normal text-zinc-500">{item.currency}</span>
          </p>
        )}
        <p className="mt-1 font-mono text-[10px] text-zinc-600">{item.sku}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  color = "text-white",
  className = "",
}: {
  label: string;
  value: number | string;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[#21262d] bg-[#161b22] px-5 py-4 ${className}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function GoldPlaceholder({ large }: { large?: boolean }) {
  return (
    <svg
      className={`text-zinc-700 ${large ? "h-10 w-10" : "h-5 w-5"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.598 4.5H9.402L12 3zm0 18l-2.598-4.5h5.196L12 21zM3 12l4.5-2.598v5.196L3 12zm18 0l-4.5 2.598V9.402L21 12z" />
    </svg>
  );
}
