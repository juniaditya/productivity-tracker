import { Database } from "lucide-react";

export function LiveDataBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      <Database className="size-3" /> Live data
    </span>
  );
}
