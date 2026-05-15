"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
  type IdTokenResult,
} from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthRole = "super_admin" | "owner" | "manager" | "cashier";

export interface AuthUserProfile {
  uid:            string;
  email:          string | null;
  displayName:    string | null;
  role:           AuthRole | null;
  tenant_id:      string | null;
  is_super_admin: boolean;
  avatar_url?:    string;
}

interface AuthState {
  user:         AuthUserProfile | null;
  firebaseUser: User | null;
  loading:      boolean;
  error:        string | null;
}

// ─── Session cookie sync ─────────────────────────────────────────────────────

async function syncSession(user: User | null): Promise<void> {
  if (!user) {
    await fetch("/api/auth/session", { method: "DELETE" });
    return;
  }
  const idToken = await user.getIdToken(/* forceRefresh */ true);
  await fetch("/api/auth/session", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ idToken }),
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, firebaseUser: null, loading: true, error: null,
  });
  const unsubProfileRef = useRef<Unsubscribe | null>(null);

  const buildProfile = useCallback(async (fbUser: User): Promise<AuthUserProfile> => {
    const token: IdTokenResult = await fbUser.getIdTokenResult(true);
    const c = token.claims as Record<string, unknown>;
    const isSuperAdmin = c.super_admin === true;
    return {
      uid:            fbUser.uid,
      email:          fbUser.email,
      displayName:    fbUser.displayName,
      role:           isSuperAdmin ? "super_admin" : ((c.role as AuthRole) ?? "cashier"),
      tenant_id:      (c.tenant_id as string) ?? null,
      is_super_admin: isSuperAdmin,
    };
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      unsubProfileRef.current?.();
      unsubProfileRef.current = null;

      if (!fbUser) {
        await syncSession(null);
        setState({ user: null, firebaseUser: null, loading: false, error: null });
        return;
      }

      try {
        const profile = await buildProfile(fbUser);
        await syncSession(fbUser);
        setState({ user: profile, firebaseUser: fbUser, loading: false, error: null });

        // Live-sync role changes from Firestore (tenant users only).
        if (!profile.is_super_admin && profile.tenant_id) {
          unsubProfileRef.current = onSnapshot(
            doc(db, "tenants", profile.tenant_id, "users", fbUser.uid),
            (snap) => {
              if (!snap.exists()) return;
              const d = snap.data();
              setState((prev) => prev.user
                ? { ...prev, user: { ...prev.user, role: d.role ?? prev.user.role, displayName: d.display_name ?? prev.user.displayName, avatar_url: d.avatar_url } }
                : prev
              );
            },
            () => { /* silently ignore offline snapshot errors */ }
          );
        }
      } catch (err) {
        setState({ user: null, firebaseUser: null, loading: false, error: (err as Error).message });
      }
    });

    return () => { unsubAuth(); unsubProfileRef.current?.(); };
  }, [buildProfile]);

  const login = useCallback(async (email: string, password: string) => {
    setState((p) => ({ ...p, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setState((p) => ({ ...p, loading: false, error: (err as Error).message }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const refreshClaims = useCallback(async () => {
    if (!state.firebaseUser) return;
    const profile = await buildProfile(state.firebaseUser);
    await syncSession(state.firebaseUser);
    setState((p) => ({ ...p, user: profile }));
  }, [state.firebaseUser, buildProfile]);

  return {
    user:            state.user,
    firebaseUser:    state.firebaseUser,
    loading:         state.loading,
    error:           state.error,
    isAuthenticated: state.user !== null,
    isSuperAdmin:    state.user?.is_super_admin ?? false,
    login,
    logout,
    refreshClaims,
  };
}
