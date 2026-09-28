import { ArrowDownRight, ArrowUpRight, Brain, CalendarDays, Database, Smartphone } from "lucide-react";
import { DemoBadge } from "@/components/demo-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";

const bars = [58, 72, 65, 83, 61, 88, 79];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function InsightsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Insights"
        title="Patterns, not vanity charts"
        description="Statistik menjawab ke mana waktu pergi, seberapa konsisten habit, apakah ada perubahan, dan pola apa yang cukup kuat untuk diperhatikan."
        action={<DemoBadge />}
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Weekly coverage" value="82%" detail="+7% vs last week" icon={<Database className="size-4" />} />
        <StatCard label="Habit completion" value="78%" detail="14 of 18 weekly goals" icon={<CalendarDays className="size-4" />} />
        <StatCard label="Productive time" value="38h 15m" detail="+3h 10m vs last week" icon={<Brain className="size-4" />} />
        <StatCard label="Screen time avg" value="3h 48m" detail="−29m vs last week" icon={<Smartphone className="size-4" />} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Daily data completeness</h2>
              <p className="mt-1 text-sm text-muted-foreground">Insight confidence drops when the timeline is incomplete.</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">7 days</span>
          </div>
          <div className="mt-8 flex h-52 items-end gap-3 sm:gap-5">
            {bars.map((value, i) => (
              <div key={days[i]} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{value}%</span>
                <div className="flex h-40 w-full items-end rounded-lg bg-muted p-1">
                  <div className="w-full rounded-md bg-primary" style={{ height: `${value}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{days[i]}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Time classification</h2>
          <p className="mt-1 text-sm text-muted-foreground">Categories can be classified by you for higher-level reporting.</p>
          <div className="mt-5 space-y-4">
            {[
              ["Productive", 41, "38h 15m", "#22c55e"],
              ["Recovery", 35, "32h 40m", "#6366f1"],
              ["Leisure", 13, "12h 08m", "#eab308"],
              ["Distraction", 7, "6h 31m", "#f43f5e"],
              ["Untracked", 4, "3h 46m", "#71717a"],
            ].map(([name, value, duration, color]) => (
              <div key={String(name)}>
                <div className="flex items-center justify-between text-sm"><span>{name}</span><span className="font-mono text-xs text-muted-foreground">{duration}</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${value}%`, background: String(color) }} /></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between"><div><h2 className="font-semibold">Observed patterns</h2><p className="mt-1 text-sm text-muted-foreground">Associations only; the app should not claim causation.</p></div><span className="font-mono text-xs text-muted-foreground">min. sample 7 days</span></div>
        <div className="grid gap-3 lg:grid-cols-3">
          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ArrowUpRight className="size-4" /><span className="text-xs font-semibold uppercase tracking-wide">Association</span></div>
            <p className="mt-4 text-sm leading-6">Pada hari olahraga tercatat, waktu belajar rata-rata <strong>1h 04m lebih tinggi</strong> daripada hari tanpa olahraga.</p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ArrowUpRight className="size-4" /><span className="text-xs font-semibold uppercase tracking-wide">Association</span></div>
            <p className="mt-4 text-sm leading-6">Saat tidur tercatat ≥7 jam, productive time rata-rata <strong>6h 12m</strong>, dibanding <strong>4h 53m</strong> pada hari lain.</p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400"><ArrowDownRight className="size-4" /><span className="text-xs font-semibold uppercase tracking-wide">Association</span></div>
            <p className="mt-4 text-sm leading-6">Ketika screen usage ≥3 jam, Japanese habit completion turun dari <strong>78%</strong> menjadi <strong>51%</strong> pada data contoh.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
