"use client";

/**
 * A compact label ticket (57 × 90 mm) for a gold inventory item.
 * Renders a QR code, shop branding, and key item metadata.
 * The @media print CSS hides all other page content so window.print() outputs
 * only this ticket.
 */

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import type { InventoryItem } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrintableTicketProps {
  item:     InventoryItem & { net_weight?: number };
  shopName: string;
  /** Base URL for the QR code deep-link; defaults to current origin */
  baseUrl?: string;
}

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  ring:      "خاتم",
  necklace:  "عقد",
  bracelet:  "سوار",
  earring:   "حلق",
  pendant:   "دلاية",
  chain:     "سلسلة",
  coin:      "عملة",
  bar:       "سبيكة",
  other:     "أخرى",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PrintableTicket({ item, shopName, baseUrl }: PrintableTicketProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const qrData = `${baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "")}/inventory/${item.id}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, qrData, {
      width:  128,
      margin: 1,
      color:  { dark: "#000000", light: "#ffffff" },
    });
  }, [qrData]);

  const priceDisplay = item.selling_price
    ? `${item.selling_price.toLocaleString("ar-SA")} ${item.currency}`
    : null;

  return (
    <>
      {/* Print isolation — hide everything else when printing */}
      <style>{`
        @media print {
          body > *:not(#printable-ticket-root) { display: none !important; }
          #printable-ticket-root {
            position: fixed !important;
            inset: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: white !important;
          }
        }
      `}</style>

      <div
        id="printable-ticket-root"
        dir="rtl"
        className="font-sans"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties}
      >
        <div
          className="relative overflow-hidden rounded-2xl border border-[#21262d] bg-white text-black shadow-2xl"
          style={{ width: 240, minHeight: 340 }}
        >
          {/* Brand header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: "#036a71" }}
          >
            <span className="text-xs font-bold tracking-widest text-white/80 uppercase">
              0%
            </span>
            <span className="text-sm font-bold text-white">{shopName}</span>
          </div>

          {/* QR code */}
          <div className="flex justify-center bg-white px-4 pt-4 pb-2">
            <canvas
              ref={canvasRef}
              width={128}
              height={128}
              className="rounded-lg"
            />
          </div>

          {/* SKU / barcode-style text */}
          <div className="bg-white px-4 pb-1 text-center">
            <p className="font-mono text-[11px] font-bold tracking-[0.25em] text-zinc-400">
              {item.sku}
            </p>
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-dashed border-zinc-200" />

          {/* Specs */}
          <div className="space-y-1.5 bg-white px-4 py-3 text-[12px]">
            <TicketRow
              label="القطعة"
              value={item.name_ar || CATEGORY_LABELS[item.category] || item.category}
            />
            <TicketRow label="العيار"  value={`${item.karat} قيراط`} />
            <TicketRow
              label="الوزن"
              value={`${item.weight} ${item.weight_unit}`}
            />
            {item.net_weight != null && item.net_weight > 0 && (
              <TicketRow
                label="صافي الذهب"
                value={`${item.net_weight} ${item.weight_unit}`}
              />
            )}
            {priceDisplay && (
              <>
                <div className="my-1 border-t border-dashed border-zinc-200" />
                <TicketRow label="سعر البيع" value={priceDisplay} bold />
              </>
            )}
          </div>

          {/* Footer */}
          <div className="bg-zinc-50 px-4 py-2.5 text-center">
            <p className="text-[10px] text-zinc-400">
              {new Date().toLocaleDateString("ar-SA", {
                day:   "numeric",
                month: "long",
                year:  "numeric",
              })}
            </p>
          </div>

          {/* Decorative corner cut */}
          <div className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full bg-[#0f1117]" />
          <div className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-[#0f1117]" />
        </div>
      </div>
    </>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function TicketRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className={bold ? "font-bold text-[#036a71]" : "font-medium text-zinc-800"}>
        {value}
      </span>
    </div>
  );
}
