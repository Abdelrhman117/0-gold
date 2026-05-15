"use client";

import { useState, useEffect } from "react";
import { subscribeToGoldPrices, type GoldPrices } from "@/lib/firebase/invoices";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LivePriceHeaderProps {
  tenantId:         string;
  onPricesUpdate?:  (prices: GoldPrices) => void;
  compact?:         boolean;  // slim single-row mode for narrow viewports
}

// ─── Karat display config ─────────────────────────────────────────────────────

const KARATS = [
  { key: "price_per_gram_24k" as const, label: "24K", color: "text-yellow-400"  },
  { key: "price_per_gram_21k" as const, label: "21K", color: "text-[#c9a84c]"   },
  { key: "price_per_gram_18k" as const, label: "18K", color: "text-amber-600"   },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function LivePriceHeader({ tenantId, onPricesUpdate, compact }: LivePriceHeaderProps) {
  const [prices,     setPrices]     = useState<GoldPrices | null>(null);
  const [prevPrices, setPrevPrices] = useState<GoldPrices | null>(null);
  const [isOnline,   setIsOnline]   = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // ── Network status ────────────────────────────────────────────────────────
  useEffect(() => {
    const up   = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online",  up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // ── Firestore subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    return subscribeToGoldPrices(tenantId, (next) => {
      setPrevPrices((prev) => prev);
      setPrices((prev) => { setPrevPrices(prev); return next; });
      onPricesUpdate?.(next);
    });
  }, [tenantId, onPricesUpdate]);

  const updatedAt = prices?.updated_at?.toDate();
  const timeLabel = updatedAt
    ? updatedAt.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      dir="rtl"
      className={`flex items-center gap-4 border-b border-[#21262d] bg-[#0f1117] px-4
        ${compact ? "py-2" : "py-3"}`}
    >
      {/* Live indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`h-2 w-2 rounded-full ${
            isOnline ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-red-500"
          } animate-pulse`}
        />
        <span className={`text-[11px] font-medium ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
          {isOnline ? "مباشر" : "بدون إنترنت"}
        </span>
      </div>

      <div className="h-4 w-px bg-[#21262d] shrink-0" />

      {/* Karat price cells */}
      {KARATS.map(({ key, label, color }) => {
        const current  = prices?.[key];
        const previous = prevPrices?.[key];
        const changed  = current != null && previous != null && current !== previous;
        const up       = changed && current! > previous!;

        return (
          <div key={key} className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-bold ${color}`}>{label}</span>
            <div className="relative">
              <span
                className={`tabular-nums text-sm font-semibold transition-colors duration-500 ${
                  changed ? (up ? "text-emerald-300" : "text-red-300") : "text-white"
                }`}
              >
                {current != null
                  ? `${current.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : prices === null
                  ? "..."
                  : "—"}
              </span>
              {changed && (
                <span className={`ms-1 text-[10px] ${up ? "text-emerald-400" : "text-red-400"}`}>
                  {up ? "▲" : "▼"}
                </span>
              )}
            </div>
            {!compact && (
              <span className="text-[10px] text-zinc-600">{prices?.currency ?? "SAR"}/جم</span>
            )}
          </div>
        );
      })}

      {/* Last updated */}
      {!compact && timeLabel && (
        <>
          <div className="h-4 w-px bg-[#21262d] shrink-0" />
          <span className="text-[11px] text-zinc-600 shrink-0">
            آخر تحديث {timeLabel}
          </span>
        </>
      )}

      {/* Offline warning pill */}
      {!isOnline && (
        <div className="me-auto flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1">
          <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-[11px] font-medium text-amber-400">
            الفواتير ستُحفظ عند استعادة الاتصال
          </span>
        </div>
      )}
    </div>
  );
}
