"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { addInventoryItem, type NewInventoryItemInput } from "@/lib/firebase/inventory";
import { PrintableTicket } from "@/components/PrintableTicket";
import type { GoldKarat, ItemCategory, WeightUnit, CurrencyCode, InventoryItem } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const KARATS: GoldKarat[]      = [24, 22, 21, 18, 14, 10, 9];
const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "ring",      label: "خاتم"     },
  { value: "necklace",  label: "عقد"      },
  { value: "bracelet",  label: "سوار"     },
  { value: "earring",   label: "حلق"      },
  { value: "pendant",   label: "دلاية"    },
  { value: "chain",     label: "سلسلة"   },
  { value: "coin",      label: "عملة"     },
  { value: "bar",       label: "سبيكة"   },
  { value: "other",     label: "أخرى"     },
];
const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: "gram",  label: "جرام" },
  { value: "ounce", label: "أوقية" },
  { value: "tola",  label: "تولة" },
  { value: "baht",  label: "بات"  },
];
const CURRENCIES: { value: CurrencyCode; label: string }[] = [
  { value: "SAR", label: "ريال سعودي" },
  { value: "EGP", label: "جنيه مصري" },
  { value: "AED", label: "درهم إماراتي" },
  { value: "USD", label: "دولار أمريكي" },
];

// Hard-coded for demo; in production read from auth context.
const TENANT_ID = "demo-tenant";

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400">
        {label}
        {required && <span className="text-[#036a71] ms-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#21262d] bg-[#161b22] px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]";

const selectCls = inputCls + " appearance-none cursor-pointer";

// ─── Page ─────────────────────────────────────────────────────────────────────

type SavedItem = InventoryItem & { net_weight: number; shop_name?: string };

export default function AddInventoryPage() {
  const router = useRouter();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState<
    NewInventoryItemInput & { net_weight: number }
  >({
    name_ar:       "",
    name:          "",
    category:      "ring",
    karat:         21,
    weight:        0,
    net_weight:    0,
    weight_unit:   "gram",
    making_charge: 0,
    cost_price:    0,
    selling_price: 0,
    currency:      "SAR",
    supplier_id:   "",
    description:   "",
    notes:         "",
  });

  // ── Image state ──────────────────────────────────────────────────────────────
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews,   setPreviews]   = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // ── Submit state ─────────────────────────────────────────────────────────────
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [savedItem,      setSavedItem]      = useState<SavedItem | null>(null);

  // ── Field change helper ───────────────────────────────────────────────────────
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Image handling ────────────────────────────────────────────────────────────
  const acceptFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setImageFiles((prev) => [...prev, ...arr].slice(0, 5));
    arr.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) =>
        setPreviews((prev) => [...prev, e.target!.result as string].slice(0, 5));
      reader.readAsDataURL(f);
    });
  }, []);

  const removeImage = (idx: number) => {
    setImageFiles((p) => p.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  // ── Drag-and-drop ─────────────────────────────────────────────────────────────
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = ()                   => setIsDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFiles(e.dataTransfer.files);
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name_ar.trim()) { setError("اسم القطعة بالعربية مطلوب"); return; }
    if (form.weight <= 0)     { setError("يجب إدخال وزن صحيح أكبر من صفر"); return; }

    setSaving(true);
    try {
      const item = await addInventoryItem(
        TENANT_ID,
        form,
        imageFiles,
        setUploadProgress
      );
      setSavedItem({ ...item, shop_name: "متجر الذهب" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── After save: show ticket overlay ──────────────────────────────────────────
  if (savedItem) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 print:bg-white print:p-0">
        <div className="w-full max-w-sm space-y-4 print:space-y-0">
          <PrintableTicket
            item={savedItem}
            shopName={savedItem.shop_name ?? "متجر الذهب"}
          />
          <div className="flex gap-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex-1 rounded-xl bg-[#036a71] py-3 text-sm font-semibold text-white transition hover:bg-[#025d63]"
            >
              طباعة البطاقة
            </button>
            <button
              onClick={() => router.push("/dashboard/inventory")}
              className="flex-1 rounded-xl border border-[#21262d] py-3 text-sm font-semibold text-zinc-300 transition hover:border-[#036a71] hover:text-white"
            >
              العودة للمخزون
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-[#0f1117] text-white">

      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#21262d] bg-[#0f1117]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs text-zinc-500">المخزون</p>
            <h1 className="text-lg font-bold">إضافة قطعة جديدة</h1>
          </div>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-[#21262d] px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            إلغاء
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">

          {/* ── Right panel: form fields ───────────────────────────────────── */}
          <div className="order-2 space-y-6 lg:order-1">

            {/* Section: Item information */}
            <section className="rounded-2xl border border-[#21262d] bg-[#161b22] p-6">
              <h2 className="mb-5 text-sm font-semibold text-[#036a71]">معلومات القطعة</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="الاسم بالعربية" required>
                    <input
                      className={inputCls}
                      placeholder="مثال: خاتم سوليتير ذهب عيار ٢١"
                      value={form.name_ar}
                      onChange={(e) => set("name_ar", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="الاسم بالإنجليزية">
                  <input
                    className={inputCls}
                    placeholder="Solitaire Ring 21K"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="التصنيف" required>
                  <select
                    className={selectCls}
                    value={form.category}
                    onChange={(e) => set("category", e.target.value as ItemCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="الوصف">
                    <textarea
                      className={inputCls + " resize-none"}
                      rows={2}
                      placeholder="وصف مختصر للقطعة..."
                      value={form.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* Section: Gold specifications */}
            <section className="rounded-2xl border border-[#21262d] bg-[#161b22] p-6">
              <h2 className="mb-5 text-sm font-semibold text-[#036a71]">مواصفات الذهب</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="العيار" required>
                  <select
                    className={selectCls}
                    value={form.karat}
                    onChange={(e) => set("karat", Number(e.target.value) as GoldKarat)}
                  >
                    {KARATS.map((k) => (
                      <option key={k} value={k}>{k} قيراط</option>
                    ))}
                  </select>
                </Field>
                <Field label="وحدة الوزن">
                  <select
                    className={selectCls}
                    value={form.weight_unit}
                    onChange={(e) => set("weight_unit", e.target.value as WeightUnit)}
                  >
                    {WEIGHT_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="الوزن الإجمالي" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    placeholder="0.00"
                    value={form.weight || ""}
                    onChange={(e) => set("weight", parseFloat(e.target.value) || 0)}
                  />
                </Field>
                <Field label="وزن الذهب الصافي" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    placeholder="0.00"
                    value={form.net_weight || ""}
                    onChange={(e) => set("net_weight", parseFloat(e.target.value) || 0)}
                  />
                </Field>
              </div>
            </section>

            {/* Section: Pricing */}
            <section className="rounded-2xl border border-[#21262d] bg-[#161b22] p-6">
              <h2 className="mb-5 text-sm font-semibold text-[#036a71]">التسعير</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="العملة">
                  <select
                    className={selectCls}
                    value={form.currency}
                    onChange={(e) => set("currency", e.target.value as CurrencyCode)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.value} — {c.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="تكلفة الشراء" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    placeholder="0.00"
                    value={form.cost_price || ""}
                    onChange={(e) => set("cost_price", parseFloat(e.target.value) || 0)}
                  />
                </Field>
                <Field label="أجرة الصنعة">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    placeholder="0.00"
                    value={form.making_charge || ""}
                    onChange={(e) => set("making_charge", parseFloat(e.target.value) || 0)}
                  />
                </Field>
                <Field label="سعر البيع" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls + " border-[#036a71]/40 focus:border-[#036a71]"}
                    placeholder="0.00"
                    value={form.selling_price || ""}
                    onChange={(e) => set("selling_price", parseFloat(e.target.value) || 0)}
                  />
                </Field>
              </div>

              {/* Margin preview */}
              {form.cost_price > 0 && form.selling_price > 0 && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#0f1117] px-4 py-3">
                  <span className="text-xs text-zinc-500">هامش الربح</span>
                  <span
                    className={`ms-auto text-sm font-bold ${
                      form.selling_price - form.cost_price >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {(
                      ((form.selling_price - form.cost_price - form.making_charge) /
                        form.cost_price) *
                      100
                    ).toFixed(1)}
                    ٪
                  </span>
                  <span className="text-sm text-zinc-300">
                    {(form.selling_price - form.cost_price - form.making_charge).toFixed(2)}{" "}
                    {form.currency}
                  </span>
                </div>
              )}
            </section>

            {/* Section: Additional info */}
            <section className="rounded-2xl border border-[#21262d] bg-[#161b22] p-6">
              <h2 className="mb-5 text-sm font-semibold text-[#036a71]">معلومات إضافية</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="كود المورد">
                  <input
                    className={inputCls}
                    placeholder="supplier-id"
                    value={form.supplier_id}
                    onChange={(e) => set("supplier_id", e.target.value)}
                  />
                </Field>
                <Field label="ملاحظات">
                  <input
                    className={inputCls}
                    placeholder="ملاحظات داخلية..."
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
              </div>
            </section>
          </div>

          {/* ── Left panel: image uploader ─────────────────────────────────── */}
          <div className="order-1 space-y-4 lg:order-2">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition
                ${
                  isDragging
                    ? "border-[#036a71] bg-[#036a71]/10"
                    : "border-[#21262d] bg-[#161b22] hover:border-[#036a71]/60 hover:bg-[#161b22]/80"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => acceptFiles(e.target.files!)}
              />
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#036a71]/15">
                  <svg className="h-6 w-6 text-[#036a71]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-300">اسحب الصور هنا</p>
                <p className="text-xs text-zinc-600">أو انقر للاختيار · حتى 5 صور</p>
              </div>
            </div>

            {/* Previews */}
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((src, idx) => (
                  <div key={idx} className="group relative aspect-square overflow-hidden rounded-xl border border-[#21262d]">
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-cover transition group-hover:scale-105"
                      sizes="120px"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
                    >
                      ×
                    </button>
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 rounded bg-[#036a71]/80 px-1.5 py-0.5 text-[10px] text-white">
                        رئيسية
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Sticky summary card */}
            <div className="sticky top-24 rounded-2xl border border-[#21262d] bg-[#161b22] p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                ملخص القطعة
              </p>
              <div className="space-y-2.5 text-sm">
                <Row label="التصنيف"  value={CATEGORIES.find((c) => c.value === form.category)?.label ?? "—"} />
                <Row label="العيار"    value={form.karat ? `${form.karat} قيراط` : "—"} />
                <Row label="الوزن"     value={form.weight ? `${form.weight} ${form.weight_unit}` : "—"} />
                <Row label="صافي الذهب" value={form.net_weight ? `${form.net_weight} ${form.weight_unit}` : "—"} />
                <div className="my-3 border-t border-[#21262d]" />
                <Row
                  label="سعر البيع"
                  value={form.selling_price ? `${form.selling_price.toLocaleString("ar-SA")} ${form.currency}` : "—"}
                  highlight
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Upload progress */}
        {saving && uploadProgress > 0 && uploadProgress < 100 && (
          <div className="mt-6 space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>جارٍ رفع الصور...</span>
              <span>{Math.round(uploadProgress)}٪</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#21262d]">
              <div
                className="h-full rounded-full bg-[#036a71] transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving}
            className="rounded-xl border border-[#21262d] px-6 py-3 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-w-[160px] rounded-xl bg-[#036a71] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#025d63] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "جارٍ الحفظ..." : "حفظ وطباعة البطاقة"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className={highlight ? "font-bold text-[#036a71]" : "text-zinc-200"}>{value}</span>
    </div>
  );
}
