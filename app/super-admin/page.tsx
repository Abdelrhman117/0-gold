"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id:               string;
  name:             string;
  owner_email:      string;
  subscription_end: Timestamp | null;
  currency:         string;
  created_at:       Timestamp | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("ar-EG", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function isExpired(ts: Timestamp | null): boolean {
  if (!ts) return true;
  return ts.toDate() < new Date();
}

// ─── New Tenant Modal ─────────────────────────────────────────────────────────

interface NewTenantModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function NewTenantModal({ onClose, onCreated }: NewTenantModalProps) {
  const [name,        setName]        = useState("");
  const [ownerEmail,  setOwnerEmail]  = useState("");
  const [currency,    setCurrency]    = useState("SAR");
  const [days,        setDays]        = useState(365);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const subscriptionEnd = new Date();
      subscriptionEnd.setDate(subscriptionEnd.getDate() + days);
      await addDoc(collection(db, "tenants"), {
        name,
        owner_email:      ownerEmail,
        currency,
        subscription_end: Timestamp.fromDate(subscriptionEnd),
        created_at:       serverTimestamp(),
        status:           "active",
      });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-[#21262d] bg-[#161b22] p-6">
        <h2 className="mb-5 text-lg font-bold text-white">إضافة متجر جديد</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">اسم المتجر</label>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-2.5 text-sm text-white outline-none focus:border-[#036a71]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">إيميل المالك</label>
            <input
              type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
              dir="ltr"
              className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-2.5 text-sm text-white outline-none focus:border-[#036a71]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">العملة</label>
              <select
                value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-2.5 text-sm text-white outline-none focus:border-[#036a71]"
              >
                <option value="SAR">SAR — ريال</option>
                <option value="EGP">EGP — جنيه</option>
                <option value="AED">AED — درهم</option>
                <option value="KWD">KWD — دينار</option>
                <option value="USD">USD — دولار</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">مدة الاشتراك (يوم)</label>
              <input
                type="number" min={1} max={3650} value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-2.5 text-sm text-white outline-none focus:border-[#036a71]"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-[#036a71] py-2.5 text-sm font-bold text-white transition hover:bg-[#025d63] disabled:opacity-50"
            >
              {loading ? "جارٍ الإنشاء..." : "إنشاء"}
            </button>
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#21262d] py-2.5 text-sm text-zinc-400 transition hover:bg-[#21262d]"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Extend Subscription Modal ────────────────────────────────────────────────

interface ExtendModalProps {
  tenant: Tenant;
  onClose: () => void;
  onUpdated: () => void;
}

function ExtendModal({ tenant, onClose, onUpdated }: ExtendModalProps) {
  const [days,    setDays]    = useState(365);
  const [loading, setLoading] = useState(false);

  const handleExtend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const base = isExpired(tenant.subscription_end) ? new Date() : tenant.subscription_end!.toDate();
    base.setDate(base.getDate() + days);
    await updateDoc(doc(db, "tenants", tenant.id), {
      subscription_end: Timestamp.fromDate(base),
    });
    onUpdated();
    onClose();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-[#21262d] bg-[#161b22] p-6">
        <h2 className="mb-1 text-lg font-bold text-white">تمديد الاشتراك</h2>
        <p className="mb-5 text-xs text-zinc-500">{tenant.name}</p>
        <form onSubmit={handleExtend} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">عدد الأيام</label>
            <input
              type="number" min={1} max={3650} value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-xl border border-[#21262d] bg-[#0f1117] px-4 py-2.5 text-sm text-white outline-none focus:border-[#036a71]"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-[#036a71] py-2.5 text-sm font-bold text-white transition hover:bg-[#025d63] disabled:opacity-50"
            >
              {loading ? "جارٍ التمديد..." : "تمديد"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#21262d] py-2.5 text-sm text-zinc-400 transition hover:bg-[#21262d]"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const router  = useRouter();
  const [tenants,    setTenants]    = useState<Tenant[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [extending,  setExtending]  = useState<Tenant | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "tenants"));
    setTenants(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tenant, "id">) }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut(auth);
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/login");
  };

  const active  = tenants.filter((t) => !isExpired(t.subscription_end));
  const expired = tenants.filter((t) =>  isExpired(t.subscription_end));

  return (
    <div dir="rtl" className="min-h-screen bg-[#0f1117] text-white">

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[#21262d] bg-[#0d1117]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#036a71]">
              <span className="text-sm font-black tracking-tighter">0%</span>
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">لوحة المشرف العام</p>
              <p className="text-[10px] text-zinc-500">Super Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNew(true)}
              className="rounded-xl bg-[#036a71] px-4 py-2 text-sm font-medium transition hover:bg-[#025d63]"
            >
              + متجر جديد
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-xl border border-[#21262d] px-4 py-2 text-sm text-zinc-400 transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-40"
            >
              {loggingOut ? "..." : "خروج"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          {[
            { label: "إجمالي المتاجر", value: tenants.length, color: "text-white" },
            { label: "اشتراك نشط",     value: active.length,  color: "text-emerald-400" },
            { label: "اشتراك منتهي",   value: expired.length, color: "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-[#21262d] bg-[#161b22] p-5">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={`mt-1 text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tenants Table */}
        <div className="rounded-2xl border border-[#21262d] bg-[#161b22] overflow-hidden">
          <div className="border-b border-[#21262d] px-6 py-4">
            <h2 className="font-semibold text-white">المتاجر المسجلة</h2>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">
              {[1,2,3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-[#21262d]" />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-16 text-center text-zinc-600">
              <p className="text-lg">لا توجد متاجر بعد</p>
              <p className="mt-1 text-sm">اضغط &quot;+ متجر جديد&quot; لإضافة أول متجر</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[#21262d] text-xs text-zinc-500">
                <tr>
                  <th className="px-6 py-3 text-start font-medium">المتجر</th>
                  <th className="px-6 py-3 text-start font-medium">المالك</th>
                  <th className="px-6 py-3 text-start font-medium">العملة</th>
                  <th className="px-6 py-3 text-start font-medium">الاشتراك</th>
                  <th className="px-6 py-3 text-start font-medium">الحالة</th>
                  <th className="px-6 py-3 text-start font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {tenants.map((t) => {
                  const expired = isExpired(t.subscription_end);
                  return (
                    <tr key={t.id} className="transition hover:bg-[#1c2128]">
                      <td className="px-6 py-4 font-medium text-white">{t.name}</td>
                      <td className="px-6 py-4 text-zinc-400" dir="ltr">{t.owner_email}</td>
                      <td className="px-6 py-4 text-zinc-400">{t.currency}</td>
                      <td className="px-6 py-4 text-zinc-400">{formatDate(t.subscription_end)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium
                          ${expired
                            ? "bg-red-500/10 text-red-400"
                            : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${expired ? "bg-red-400" : "bg-emerald-400"}`} />
                          {expired ? "منتهي" : "نشط"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setExtending(t)}
                          className="rounded-lg border border-[#21262d] px-3 py-1.5 text-xs text-zinc-400 transition hover:border-[#036a71] hover:text-[#036a71]"
                        >
                          تمديد
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showNew && (
        <NewTenantModal onClose={() => setShowNew(false)} onCreated={fetchTenants} />
      )}
      {extending && (
        <ExtendModal tenant={extending} onClose={() => setExtending(null)} onUpdated={fetchTenants} />
      )}
    </div>
  );
}
