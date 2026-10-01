import { BookUp2, Palette } from "lucide-react";
import { BackupPanel } from "@/components/backup-panel";
import { CategoryManager } from "@/components/category-manager";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { SystemPreferences } from "@/components/system-preferences";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import type { Category, UserSettings } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: userData }, { data: settings }, { data: categories }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("user_settings").select("user_id,timezone,day_cutoff,gamification_enabled").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
  ]);

  const userId = userData.user?.id ?? "";
  const userSettings = (settings ?? {
    user_id: userId,
    timezone: "Asia/Makassar",
    day_cutoff: "23:59:59",
    gamification_enabled: true,
  }) as UserSettings;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Settings"
        title="Personal tracker settings"
        description="Focus Ledger sekarang kembali ke workflow manual: kategori, timezone, tampilan, dan backup data pribadi."
        action={<LiveDataBadge />}
      />

      <section className="mt-6 grid gap-6">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><Palette className="size-4" /></span><div><h2 className="font-semibold">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Light, dark, atau mengikuti operating system.</p></div></div>
            <ThemeToggle />
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <SystemPreferences initialSettings={userSettings} />
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <CategoryManager userId={userId} initialCategories={(categories ?? []) as Category[]} />
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <BackupPanel />
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><BookUp2 className="size-4" /></span><div><h2 className="font-semibold">Deployment workflow</h2><p className="mt-1 text-sm text-muted-foreground">Laptop folder → GitHub → Vercel. Repository tetap source of truth.</p></div></div>
          <div className="mt-4 rounded-lg bg-muted p-4 font-mono text-xs leading-6 text-muted-foreground">git add .<br />git commit -m &quot;feat: improve tracker&quot;<br />git push<br /><span className="text-foreground"># Vercel auto-deploys main</span></div>
        </article>
      </section>
    </div>
  );
}
