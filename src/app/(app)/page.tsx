import { Activity, CheckCircle2, Clock3, Smartphone } from "lucide-react";
import Link from "next/link";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { Progress } from "@/components/progress";
import { StatCard } from "@/components/stat-card";
import { dateKeyInTimeZone, formatDateKey, weekRange } from "@/lib/date";
import { formatDuration } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Category, Habit, HabitCheck, ScreenUsage, TimeBlock } from "@/lib/types";

function clockCoverage(blocks: TimeBlock[]) {
  const slots = new Set<number>();
  for (const block of blocks) {
    for (let minute = block.start_minute; minute < block.end_minute; minute += 15) slots.add(minute);
  }
  return slots.size * 15;
}

export default async function TodayPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: categories }, { data: habits }] = await Promise.all([
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").eq("is_active", true).order("sort_order"),
    supabase.from("habits").select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").eq("is_active", true).order("sort_order"),
  ]);

  const timezone = settings?.timezone ?? "Asia/Makassar";
  const today = dateKeyInTimeZone(new Date(), timezone);
  const week = weekRange(today);

  const [blocksResult, todayChecksResult, weekChecksResult, screenResult] = await Promise.all([
    supabase.from("time_blocks").select("id,activity_date,start_minute,end_minute,category_id,note,source").eq("activity_date", today).order("start_minute"),
    supabase.from("habit_checks").select("id,habit_id,check_date,checked,source,note").eq("check_date", today).eq("checked", true),
    supabase.from("habit_checks").select("id,habit_id,check_date,checked,source,note").gte("check_date", week.start).lte("check_date", week.end).eq("checked", true),
    supabase.from("screen_usage").select("usage_date,device,app_name,domain,duration_seconds").eq("usage_date", today),
  ]);

  const blocks = (blocksResult.data ?? []) as TimeBlock[];
  const categoryList = (categories ?? []) as Category[];
  const habitList = (habits ?? []) as Habit[];
  const todayChecks = (todayChecksResult.data ?? []) as HabitCheck[];
  const weekChecks = (weekChecksResult.data ?? []) as HabitCheck[];
  const screenUsage = (screenResult.data ?? []) as ScreenUsage[];

  const tracked = clockCoverage(blocks);
  const coverage = Math.round((tracked / 1440) * 100);
  const categoryMap = new Map(categoryList.map((category) => [category.id, category]));
  const totals = new Map<string, number>();
  for (const block of blocks) totals.set(block.category_id, (totals.get(block.category_id) ?? 0) + (block.end_minute - block.start_minute));
  const timeDistribution = Array.from(totals.entries())
    .map(([categoryId, value]) => ({ category: categoryMap.get(categoryId), value }))
    .filter((item): item is { category: Category; value: number } => Boolean(item.category))
    .sort((a, b) => b.value - a.value);

  const checkedToday = new Set(todayChecks.map((check) => check.habit_id));
  const habitDone = checkedToday.size;
  const weeklyDoneByHabit = new Map<string, number>();
  for (const check of weekChecks) weeklyDoneByHabit.set(check.habit_id, (weeklyDoneByHabit.get(check.habit_id) ?? 0) + 1);
  const weeklyTarget = habitList.reduce((sum, habit) => sum + (habit.weekly_target ?? 0), 0);
  const weeklyDone = habitList.reduce((sum, habit) => sum + Math.min(weeklyDoneByHabit.get(habit.id) ?? 0, habit.weekly_target ?? 0), 0);

  const totalScreenSeconds = screenUsage.reduce((sum, item) => sum + item.duration_seconds, 0);
  const appTotals = new Map<string, number>();
  for (const item of screenUsage) {
    const name = item.app_name || item.domain || item.device || "Other";
    appTotals.set(name, (appTotals.get(name) ?? 0) + item.duration_seconds);
  }
  const topApps = Array.from(appTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Today"
        title={formatDateKey(today)}
        description="Ringkasan real-time dari Timeline, Habits, dan digital usage. Tidak ada angka demo pada halaman ini."
        action={<LiveDataBadge />}
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Time logged" value={formatDuration(tracked)} detail={`${coverage}% dari 24 jam`} icon={<Clock3 className="size-4" />} />
        <StatCard label="Habits done" value={`${habitDone}/${habitList.length}`} detail={habitList.length ? `${Math.round((habitDone / habitList.length) * 100)}% hari ini` : "Belum ada habit"} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Screen usage" value={formatDuration(Math.round(totalScreenSeconds / 60))} detail={screenUsage.length ? "Imported usage data" : "Belum ada import StayFree"} icon={<Smartphone className="size-4" />} />
        <StatCard label="Weekly goals" value={`${weeklyDone}/${weeklyTarget}`} detail={weeklyTarget ? `${Math.round((weeklyDone / weeklyTarget) * 100)}% target minggu ini` : "Belum ada target"} icon={<Activity className="size-4" />} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-semibold tracking-tight">Time coverage</h2><p className="mt-1 text-sm text-muted-foreground">Overlap dua aktivitas tetap dihitung satu kali untuk coverage 24 jam.</p></div>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">{coverage}%</span>
          </div>
          <Progress value={coverage} className="mt-4" />

          <div className="mt-6 space-y-4">
            {timeDistribution.length ? timeDistribution.map(({ category, value }) => {
              const activityTotal = Array.from(totals.values()).reduce((sum, minutes) => sum + minutes, 0) || 1;
              const pct = Math.round((value / activityTotal) * 100);
              return (
                <div key={category.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: category.color }} /><span>{category.name}</span></div><span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(value)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: category.color }} /></div>
                </div>
              );
            }) : <div className="rounded-lg border border-dashed border-border p-5 text-center"><p className="text-sm font-medium">Belum ada waktu yang tercatat hari ini</p><p className="mt-1 text-xs text-muted-foreground">Isi Timeline 15 menit untuk mulai membangun data produktivitas.</p></div>}
          </div>
          <Link href="/timeline" className="mt-6 inline-flex text-sm font-medium text-primary hover:underline">Open timeline →</Link>
        </article>

        <div className="grid gap-6">
          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold tracking-tight">Today&apos;s habits</h2><p className="mt-1 text-sm text-muted-foreground">Centang dari Habit Planner; automatic rules menyusul.</p></div><span className="font-mono text-sm text-muted-foreground">{habitDone}/{habitList.length}</span></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {habitList.slice(0, 10).map((habit) => {
                const done = checkedToday.has(habit.id);
                return <div key={habit.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"><span className={`grid size-5 place-items-center rounded-md border ${done ? "border-transparent text-white" : "border-border"}`} style={done ? { background: habit.color } : undefined}>{done ? <CheckCircle2 className="size-3.5" /> : null}</span><span className="size-2 rounded-full" style={{ background: habit.color }} /><span className="text-sm">{habit.name}</span></div>;
              })}
            </div>
            <Link href="/habits" className="mt-4 inline-flex text-sm font-medium text-primary hover:underline">Open habits →</Link>
          </article>

          <article className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold tracking-tight">Digital usage</h2><p className="mt-1 text-sm text-muted-foreground">Akan terisi setelah StayFree CSV importer aktif.</p></div><span className="font-mono text-sm text-muted-foreground">{formatDuration(Math.round(totalScreenSeconds / 60))}</span></div>
            <div className="mt-4 divide-y divide-border">
              {topApps.length ? topApps.map(([name, seconds]) => <div key={name} className="flex items-center justify-between py-2.5 text-sm"><span>{name}</span><span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(Math.round(seconds / 60))}</span></div>) : <p className="py-4 text-sm text-muted-foreground">Belum ada data screen usage.</p>}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
