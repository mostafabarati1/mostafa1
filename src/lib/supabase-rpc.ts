import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

type FnName = keyof Database["public"]["Functions"];

/**
 * Thin typed wrapper over supabase.rpc that unwraps { data, error }.
 * All page-level reads/writes go through the existing DB functions.
 */
export async function rpc<T = unknown>(fn: FnName, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, sanitizeArgs(args) as never);
  if (error) throw error;
  return data as T;
}

/** Postgres rejects "" for uuid params, so blank id values are sent as null. */
function sanitizeArgs(args?: Record<string, unknown>) {
  if (!args) return args;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/(_id|_ids|_by)$/.test(key)) {
      if (value === "") {
        out[key] = null;
        continue;
      }
      if (Array.isArray(value)) {
        out[key] = value.filter((v) => v !== "" && v != null);
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}
