"use client";

import { Download, ShieldCheck } from "lucide-react";

export function BackupPanel() {
  return (
    <div>
      <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><ShieldCheck className="size-4" /></span><div><h2 className="font-semibold">Backup & export</h2><p className="mt-1 text-sm text-muted-foreground">Download snapshot JSON dari semua data produktivitas milik akun ini.</p></div></div>
      <div className="mt-4 rounded-lg border border-border p-4">
        <p className="text-sm leading-6 text-muted-foreground">Backup berisi settings, categories, Timeline, habits, rules, checks, StayFree rows, Calendar preferences, dan milestones. <strong className="text-foreground">OAuth refresh token tidak pernah dimasukkan.</strong></p>
        <a href="/api/export/data" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Download className="size-4" /> Download JSON backup</a>
      </div>
    </div>
  );
}
