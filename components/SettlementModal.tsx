"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/lib/firebase/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettlementModalProps {
  tenantId:           string;
  supplierId:         string;
  supplierName:       string;
  weightBalance21k:   number;   // available grams in 21K equivalent
  currentPrice21k:    number;   // pre-filled from LivePriceHeader
  currency:           string;
  onClose:            () => void;
  onSuccess:          (result: SettlementResult) => void;
}

interface SettlementResult {
  new_weight_balance: number;
  new_cash_balance:   number;
  cash_value_settled: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettlementModal({
  tenantId,
  supplierId,
  supplierName,
  weightBalance21k,
  currentPrice21k,
  currency,
  onClose,
  onSuccess,
}: SettlementModalProps) {
  const [weightToSettle,  setWeightToSettle]  = useState<number>(0);
  const [pricePerGram,    setPricePerGram]    = useState<number>(currentPrice21k);
  const [notes,           setNotes]           = useState("");
  const [isSubmitting,    setIsSubmitting]    = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const overlayRef  = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first input on mount
  useEffect(() => { firstInputRef.current?.focus(); }, []);

  // Sync price when parent prop changes (e.g. live price update)
  useEffect(() => { setPricePerGram(currentPrice21k); }, [currentPrice21k]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Computed preview
  const cashValue    = parseFloat((weightToSettle * pricePerGram).toFixed(2));
  const isValid      = weightToSettle > 0
    && weightToSettle <= weightBalance21k
    && pricePerGram > 0;
  const percentageOfBalance =
    weightBalance21k > 0 ? Math.min(100, (weightToSettle / weightBalance21k) * 100) : 0;

  // ── Settle all shortcut ────────────────────────────────────────────────────
  const settleAll = useCallback(() => {
    setWeightToSettle(parseFloat(weightBalance21k.toFixed(3)));
  }, [weightBalance21k]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const functions = getFunctions(app, "us-central1");
      const settle    = httpsCallable<
        {
          tenant_id:          string;
          supplier_id:        string;
          weight_to_settle:   number;
          price_per_gram_21k: number;
          notes?:             string;
        },
        SettlementResult & { success: boolean }
      >(functions, "settleSupplierWeight");

      const response = await settle({
        tenant_id:          tenantId,
        supplier_id:        supplierId,
        weight_to_settle:   weightToSettle,
        price_per_gram_21k: pricePerGram,
        notes:              notes || undefined,
      });

      onSuccess(response.data);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? "حدث خطأ غير متوقع";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, tenantId, supplierId, weightToSettle, pricePerGram, notes, onSuccess]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[#21262d] bg-[#161b22] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21262d] px-6 py-4">
          <div>
            <h2 id="settlement-title" className="text-base font-bold text-white">
              تسوية رصيد الوزن
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">{supplierName}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-[#21262d] hover:text-white"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Current balance summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#0f1117] border border-[#21262d] px-4 py-3">
              <p className="text-[11px] text-zinc-500">رصيد الوزن (معيار 21)</p>
              <p className="mt-1 tabular-nums text-lg font-bold text-amber-400">
                {weightBalance21k.toLocaleString("ar-SA", { minimumFractionDigits: 3 })}
                <span className="ms-1 text-xs font-normal text-zinc-500">جم</span>
              </p>
            </div>
            <div className="rounded-xl bg-[#0f1117] border border-[#21262d] px-4 py-3">
              <p className="text-[11px] text-zinc-500">سعر اليوم (21)</p>
              <p className="mt-1 tabular-nums text-lg font-bold text-[#036a71]">
                {pricePerGram.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
                <span className="ms-1 text-xs font-normal text-zinc-500">{currency}/جم</span>
              </p>
            </div>
          </div>

          {/* Weight to settle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">
                الوزن المراد تسويته <span className="text-[#036a71]">*</span>
              </label>
              <button
                type="button"
                onClick={settleAll}
                className="text-[11px] text-[#036a71] hover:underline"
              >
                تسوية الكل
              </button>
            </div>
            <div className="relative">
              <input
                ref={firstInputRef}
                type="number"
                min="0.001"
                max={weightBalance21k}
                step="0.001"
                value={weightToSettle || ""}
                onChange={(e) => setWeightToSettle(parseFloat(e.target.value) || 0)}
                placeholder="0.000"
                className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-3 pe-16 text-right text-sm text-white tabular-nums outline-none transition placeholder-zinc-600 focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
              />
              <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-xs text-zinc-500">
                جم (21)
              </span>
            </div>

            {/* Progress bar */}
            {weightToSettle > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#21262d]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      weightToSettle > weightBalance21k ? "bg-red-500" : "bg-[#036a71]"
                    }`}
                    style={{ width: `${Math.min(100, percentageOfBalance)}%` }}
                  />
                </div>
                {weightToSettle > weightBalance21k && (
                  <p className="text-[11px] text-red-400">
                    يتجاوز الرصيد المتاح بـ {(weightToSettle - weightBalance21k).toFixed(3)} جم
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Price override */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">
              سعر الجرام المتفق عليه <span className="text-[#036a71]">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={pricePerGram || ""}
              onChange={(e) => setPricePerGram(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-3 text-right text-sm text-white tabular-nums outline-none transition placeholder-zinc-600 focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">ملاحظات (اختياري)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تسوية شهر مايو 2025"
              className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-3 text-sm text-white outline-none transition placeholder-zinc-600 focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
            />
          </div>

          {/* Preview */}
          {isValid && (
            <div className="rounded-xl border border-[#036a71]/30 bg-[#036a71]/5 px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#036a71]/70">
                معاينة التسوية
              </p>
              <div className="space-y-2 text-sm">
                <PreviewRow
                  label="وزن يُحوَّل"
                  value={`${weightToSettle.toFixed(3)} جم (معيار 21)`}
                />
                <PreviewRow
                  label="سعر التسوية"
                  value={`${pricePerGram.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${currency}/جم`}
                />
                <div className="my-2 border-t border-[#036a71]/20" />
                <PreviewRow
                  label="قيمة نقدية تُضاف للمديونية"
                  value={`${cashValue.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${currency}`}
                  bold
                />
                <PreviewRow
                  label="رصيد الوزن بعد التسوية"
                  value={`${(weightBalance21k - weightToSettle).toFixed(3)} جم`}
                  muted
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-[#21262d] py-3 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="flex-1 rounded-xl bg-[#036a71] py-3 text-sm font-bold text-white transition hover:bg-[#025d63] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "جارٍ التسوية..." : "تأكيد التسوية"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── PreviewRow ───────────────────────────────────────────────────────────────

function PreviewRow({
  label, value, bold, muted,
}: {
  label: string; value: string; bold?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span
        className={`tabular-nums text-right ${
          bold  ? "text-sm font-bold text-white" :
          muted ? "text-xs text-zinc-500" :
          "text-sm text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
