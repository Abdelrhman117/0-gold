"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/config";

// ─── Inner form — useSearchParams must live inside <Suspense> ─────────────────

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get("redirect") ?? "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);

      const idToken = await user.getIdToken();
      const res     = await fetch("/api/auth/session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "فشل إنشاء الجلسة — حاول مرة أخرى.");
      }

      const claims       = await user.getIdTokenResult();
      const isSuperAdmin = claims.claims.super_admin === true;
      router.replace(isSuperAdmin ? "/super-admin" : redirectTo);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password"
          ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
          : code === "auth/too-many-requests"
          ? "تم حظر الحساب مؤقتاً بسبب محاولات متكررة. حاول لاحقاً."
          : (err as Error).message
      );
    } finally {
      setLoading(false);
    }
  }, [email, password, router, redirectTo]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">البريد الإلكتروني</label>
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          dir="ltr"
          className="w-full rounded-xl border border-[#21262d] bg-[#161b22] px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">كلمة المرور</label>
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-[#21262d] bg-[#161b22] px-4 py-3 pe-11 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#036a71] focus:ring-1 focus:ring-[#036a71]"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPass((v) => !v)}
            className="absolute inset-y-0 start-0 flex items-center px-3 text-zinc-500 hover:text-white transition"
          >
            {showPass ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full rounded-xl bg-[#036a71] py-3.5 text-sm font-bold text-white transition hover:bg-[#025d63] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            جارٍ التحقق...
          </span>
        ) : (
          "دخول"
        )}
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0f1117] px-4">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#036a71]">
            <span className="text-2xl font-black text-white tracking-tighter">0%</span>
          </div>
          <h1 className="text-2xl font-bold text-white">تسجيل الدخول</h1>
          <p className="mt-1 text-sm text-zinc-500">نظام إدارة محلات الذهب</p>
        </div>

        {/* Form wrapped in Suspense — required for useSearchParams in Next.js 14 */}
        <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-[#161b22]" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-zinc-600">
          مشكلة في الدخول؟ تواصل مع مدير النظام.
        </p>
      </div>
    </div>
  );
}
