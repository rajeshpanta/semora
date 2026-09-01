/**
 * @supabase/supabase-js stand-in, for Deno tests only.
 *
 * Its whole job is to CAPTURE what lib/supabase.ts passes to createClient —
 * the chunked storage adapter and the instrumented fetch — so tests can drive
 * the real production implementations instead of a copy of them. A copy would
 * pass forever after the original had drifted.
 *
 * Referenced only from lib/deno.test.json. Metro never sees this file.
 */

export type CapturedClient = {
  url: string;
  key: string;
  options: {
    auth: {
      storage: {
        getItem: (key: string) => Promise<string | null>;
        setItem: (key: string, value: string) => Promise<void>;
        removeItem: (key: string) => Promise<void>;
      };
    };
    global: { fetch: typeof fetch };
  };
};

export let captured: CapturedClient | null = null;

export function createClient(url: string, key: string, options: any) {
  captured = { url, key, options };
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ insert: () => ({ then: () => {} }) }),
  };
}
