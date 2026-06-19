import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient(url: string, anonKey: string) {
  return createClient(url, anonKey);
}

export { createClient } from "@supabase/supabase-js";
export type { SupabaseClient } from "@supabase/supabase-js";
