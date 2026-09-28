import { isSupabaseConfigured } from "@/lib/supabase/env";

export function DemoBadge() {
  if (isSupabaseConfigured()) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
      Demo data · connect Supabase to persist
    </span>
  );
}
