import {
  BookUp2,
  CalendarDays,
  DatabaseZap,
  FileSpreadsheet,
  Palette,
  PlugZap,
  Smartphone,
} from "lucide-react";
import { DemoBadge } from "@/components/demo-badge";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { categoryPresets, colorPresets } from "@/lib/constants";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Settings"
        title="System & integrations"
        description="Kategori tetap satu level dan seluruh integrasi dipisahkan dari workflow pencatatan harian agar layar utama tetap cepat."
        action={<DemoBadge />}
      />

      <section className="mt-6 grid gap-6">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-muted"><Palette className="size-4" /></span>
              <div><h2 className="font-semibold">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Light, dark, or follow the operating system.</p></div>
            </div>
            <ThemeToggle />
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-muted"><DatabaseZap className="size-4" /></span>
            <div><h2 className="font-semibold">Activity categories</h2><p className="mt-1 text-sm text-muted-foreground">Default presets are editable. Add, archive, rename, reorder, or recolor them later.</p></div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {categoryPresets.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-center gap-2.5"><span className="size-3 rounded-full" style={{ background: cat.color }} /><span className="text-sm font-medium">{cat.name}</span></div>
                <span className="rounded-md bg-muted px-2 py-1 text-[10px] capitalize text-muted-foreground">{cat.classification}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Preset colors</p>
            <div className="flex flex-wrap gap-2">{colorPresets.map((color) => <span key={color} className="size-7 rounded-lg border border-black/5" style={{ background: color }} title={color} />)}</div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-muted"><PlugZap className="size-4" /></span>
            <div><h2 className="font-semibold">Integrations</h2><p className="mt-1 text-sm text-muted-foreground">External data stays traceable by source instead of being silently merged with manual time entries.</p></div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><CalendarDays className="size-4" /></span><div><h3 className="text-sm font-semibold">Google Calendar</h3><p className="text-xs text-muted-foreground">Timeline only</p></div></div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">Import scheduled events into time blocks and export saved blocks back to Calendar.</p>
              <button className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Connect later</button>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><Smartphone className="size-4" /></span><div><h3 className="text-sm font-semibold">StayFree</h3><p className="text-xs text-muted-foreground">CSV import first</p></div></div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">Import device/app usage with deduplication. Screen-time habit rules can use this data instead of manual Timeline entries.</p>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><FileSpreadsheet className="size-4" /> Import CSV later</button>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><BookUp2 className="size-4" /></span><div><h2 className="font-semibold">Deployment workflow</h2><p className="mt-1 text-sm text-muted-foreground">Laptop folder → GitHub → Vercel. The repository is the source of truth.</p></div></div>
          <div className="mt-4 rounded-lg bg-muted p-4 font-mono text-xs leading-6 text-muted-foreground">
            git add .<br />
            git commit -m &quot;feat: improve tracker&quot;<br />
            git push<br />
            <span className="text-foreground"># Vercel auto-deploys the commit</span>
          </div>
        </article>
      </section>
    </div>
  );
}
