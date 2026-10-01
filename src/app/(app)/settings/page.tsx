import {
  BookUp2,
  CalendarDays,
  Palette,
  PlugZap,
  Smartphone,
} from "lucide-react";
import { BackupPanel } from "@/components/backup-panel";
import { CategoryManager } from "@/components/category-manager";
import { GoogleCalendarPanel } from "@/components/google-calendar-panel";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { StayFreeImporter } from "@/components/stayfree-importer";
import { SystemPreferences } from "@/components/system-preferences";
import { ThemeToggle } from "@/components/theme-toggle";
import { dateKeyInTimeZone } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { CalendarPreference, Category, ImportBatch, UserSettings } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [
    { data: userData },
    { data: settings },
    { data: categories },
    { data: batches },
    { data: calendarPreference },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("user_settings").select("user_id,timezone,day_cutoff,gamification_enabled").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
    supabase.from("import_batches").select("id,source,file_name,row_count,imported_at").eq("source", "stayfree_csv").order("imported_at", { ascending: false }).limit(5),
    supabase.from("calendar_preferences").select("user_id,import_calendar_id,export_calendar_id,import_category_id,skip_all_day").maybeSingle(),
  ]);

  const userId = userData.user?.id ?? "";
  const userSettings = (settings ?? {
    user_id: userId,
    timezone: "Asia/Makassar",
    day_cutoff: "23:59:59",
    gamification_enabled: true,
  }) as UserSettings;
  const today = dateKeyInTimeZone(new Date(), userSettings.timezone);
  const preference = (calendarPreference ?? {
    user_id: userId,
    import_calendar_id: null,
    export_calendar_id: null,
    import_category_id: null,
    skip_all_day: true,
  }) as CalendarPreference;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Settings"
        title="System & integrations"
        description="Kelola behavior aplikasi, kategori, StayFree, Google Calendar, backup, dan deployment dari satu tempat."
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
          <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><PlugZap className="size-4" /></span><div><h2 className="font-semibold">Integrations</h2><p className="mt-1 text-sm text-muted-foreground">External data tetap traceable berdasarkan source dan tidak digabung diam-diam dengan input manual.</p></div></div>
          <div className="mt-5 grid gap-4">
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><Smartphone className="size-4" /></span><div><h3 className="text-sm font-semibold">StayFree</h3><p className="text-xs text-muted-foreground">CSV import · active</p></div></div>
              <div className="mt-4"><StayFreeImporter initialBatches={(batches ?? []) as ImportBatch[]} /></div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><CalendarDays className="size-4" /></span><div><h3 className="text-sm font-semibold">Google Calendar</h3><p className="text-xs text-muted-foreground">OAuth · manual day sync</p></div></div>
              <GoogleCalendarPanel categories={(categories ?? []) as Category[]} initialPreferences={preference} today={today} />
            </div>
          </div>
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
