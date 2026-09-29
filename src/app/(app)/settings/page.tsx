import {
  BookUp2,
  CalendarDays,
  FileSpreadsheet,
  Palette,
  PlugZap,
  Smartphone,
} from "lucide-react";
import { CategoryManager } from "@/components/category-manager";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: userData }, { data: categories }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Settings"
        title="System & integrations"
        description="Kelola kategori, appearance, dan integrasi. Kategori yang diarsipkan tidak muncul di Timeline tetapi data lama tetap aman."
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
          <CategoryManager userId={userData.user?.id ?? ""} initialCategories={(categories ?? []) as Category[]} />
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><PlugZap className="size-4" /></span><div><h2 className="font-semibold">Integrations</h2><p className="mt-1 text-sm text-muted-foreground">External data tetap punya source sendiri dan tidak diam-diam dicampur dengan pencatatan manual.</p></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><CalendarDays className="size-4" /></span><div><h3 className="text-sm font-semibold">Google Calendar</h3><p className="text-xs text-muted-foreground">Next phase · Timeline only</p></div></div><p className="mt-3 text-sm leading-5 text-muted-foreground">Import scheduled events ke time blocks dan export block tersimpan kembali ke Calendar.</p><button disabled className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground opacity-60">Coming next</button></div>
            <div className="rounded-xl border border-border p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><Smartphone className="size-4" /></span><div><h3 className="text-sm font-semibold">StayFree</h3><p className="text-xs text-muted-foreground">Next phase · CSV import</p></div></div><p className="mt-3 text-sm leading-5 text-muted-foreground">Import device/app usage dengan deduplication; nantinya bisa dipakai untuk screen-time habit rules.</p><button disabled className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground opacity-60"><FileSpreadsheet className="size-4" /> CSV importer next</button></div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><BookUp2 className="size-4" /></span><div><h2 className="font-semibold">Deployment workflow</h2><p className="mt-1 text-sm text-muted-foreground">Laptop folder → GitHub → Vercel. Repository tetap source of truth.</p></div></div>
          <div className="mt-4 rounded-lg bg-muted p-4 font-mono text-xs leading-6 text-muted-foreground">git add .<br />git commit -m &quot;feat: improve tracker&quot;<br />git push<br /><span className="text-foreground"># Vercel auto-deploys main</span></div>
        </article>
      </section>
    </div>
  );
}
