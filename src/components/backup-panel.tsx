"use client";

import { DatabaseBackup, Download } from "lucide-react";

export function BackupPanel() {
  return (
    <div>
      <div className="flex gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-muted"><DatabaseBackup className="size-4" /></span>
        <div><h2 className="font-semibold">Backup & export</h2><p className="mt-1 text-sm text-muted-foreground">Backup manual berisi settings, categories, Timeline, habits, habit checks, dan milestones.</p></div>
      </div>
      <a href="/api/export/data" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"><Download className="size-4" /> Download JSON backup</a>
    </div>
  );
}
