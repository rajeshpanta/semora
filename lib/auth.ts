import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { QueryClient } from '@tanstack/react-query';
import { resetOnSignOut } from '@/lib/purchases';

let _queryClient: QueryClient | null = null;

/** Call once from _layout.tsx so signOut can clear the cache */
export function setQueryClient(qc: QueryClient) {
  _queryClient = qc;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } finally {
    // Always clear local state, even if the API call fails —
    // a stuck session is worse than a stale sign-out
    useAppStore.getState().setSelectedSemester(null);
    useAppStore.getState().setIsPro(false);
    _queryClient?.clear();
    resetOnSignOut().catch(() => {});
  }
}
