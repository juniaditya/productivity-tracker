import { Activity, CheckCircle2, Clock3, Smartphone } from "lucide-react";
import Link from "next/link";
import { DemoBadge } from "@/components/demo-badge";
import { PageHeader } from "@/components/page-header";
import { Progress } from "@/components/progress";
import { StatCard } from "@/components/stat-card";
import { formatDuration } from "@/lib/format";
import { habitsToday, screenUsage, timeDistribution } from "@/lib/demo-data";

export default function TodayPage() {
  const tracked = 585;
  const coverage = Math.round((tracked / 1440) * 100);
  const habitDone = habitsToday.filter((h) => h.done).length;
  const totalScreen = screenUsage.reduce((sum, item) => sum + item.minutes, 0);
  const date = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Pontianak",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Today"
        title={date}
        description="Satu layar untuk melihat kelengkapan pencatatan waktu, habit, dan penggunaan digital hari ini."
        action={<DemoBadge />}
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Time logged" value={formatDuration(tracked)} detail={`${coverage}% dari 24 jam`} icon={<Clock3 className="size-4" />} />
        <StatCard label="Habits done" value={`${habitDone}/${habitsToday.length}`} detail={`${Math.round((habitDone / habitsToday.length) * 100)}% completion`} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Screen usage" value={formatDuration(totalScreen)} detail="Imported usage data" icon={<Smartphone className="size-4" />} />
        <StatCard label="Weekly goals" value="13/18" detail="72% completion" icon={<Activity className="size-4" />} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold tracking-tight">Time coverage</h2>
              <p className="mt-1 text-sm text-muted-foreground">Unique clock coverage; overlapping activities do not inflate the 24-hour total.</p>
            </div>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">{coverage}%</span>
          </div>
          <Progress value={coverage} className="mt-4" />

          <div className="mt-6 space-y-4">
            {timeDistribution.map((item) => {
              const pct = Math.round((item.value / tracked) * 100);
              return (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: item.color }} />
                      <span>{item.label}</span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(item.value)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <Link href="/timeline" className="mt-6 inline-flex text-sm font-medium text-primary hover:underline">Open timeline →</Link>
        </article>

        <div className="grid gap-6">
          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold tracking-tight">Today&apos;s habits</h2>
                <p className="mt-1 text-sm text-muted-foreground">Manual checks and automatic rules share the same result.</p>
              </div>
              <span className="font-mono text-sm text-muted-foreground">{habitDone}/{habitsToday.length}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {habitsToday.map((habit) => (
                <div key={habit.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                  <span className={`grid size-5 place-items-center rounded-md border ${habit.done ? "border-transparent bg-primary text-primary-foreground" : "border-border"}`}>
                    {habit.done ? <CheckCircle2 className="size-3.5" /> : null}
                  </span>
                  <span className="size-2 rounded-full" style={{ background: habit.color }} />
                  <span className="text-sm">{habit.name}</span>
                </div>
              ))}
            </div>
            <Link href="/habits" className="mt-4 inline-flex text-sm font-medium text-primary hover:underline">Open habits →</Link>
          </article>

          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold tracking-tight">Digital usage</h2>
                <p className="mt-1 text-sm text-muted-foreground">Designed for StayFree CSV import first.</p>
              </div>
              <span className="font-mono text-sm text-muted-foreground">{formatDuration(totalScreen)}</span>
            </div>
            <div className="mt-4 divide-y divide-border">
              {screenUsage.map((item) => (
                <div key={item.name} className="flex items-center justify-between py-2.5 text-sm">
                  <span>{item.name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(item.minutes)}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
