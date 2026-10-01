import { Brain, CalendarDays, Database } from "lucide-react";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { dateKeyInTimeZone, shiftDateKey } from "@/lib/date";
import { formatDuration } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Category, Habit, HabitCheck, TimeBlock } from "@/lib/types";

const classificationColors: Record<string, string> = {
  productive: "#22c55e",
  recovery: "#6366f1",
  leisure: "#eab308",
  distraction: "#f43f5e",
  neutral: "#64748b",
};

export default async function InsightsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: categories }, { data: habits }] = await Promise.all([
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active"),
    supabase.from("habits").select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").eq("is_active", true),
  ]);
  const timezone = settings?.timezone ?? "Asia/Makassar";
  const today = dateKeyInTimeZone(new Date(), timezone);
  const start7 = shiftDateKey(today, -6);
  const start28 = shiftDateKey(today, -27);

  const [blocksResult, checksResult] = await Promise.all([
    supabase.from("time_blocks").select("id,activity_date,start_minute,end_minute,category_id,note,source").gte("activity_date", start28).lte("activity_date", today),
    supabase.from("habit_checks").select("id,habit_id,check_date,checked,source,note").gte("check_date", start28).lte("check_date", today).eq("checked", true),
  ]);

  const blocks28 = (blocksResult.data ?? []) as TimeBlock[];
  const checks28 = (checksResult.data ?? []) as HabitCheck[];
  const categoryList = (categories ?? []) as Category[];
  const habitList = (habits ?? []) as Habit[];
  const categoryMap = new Map(categoryList.map((category) => [category.id, category]));
  const blocks = blocks28.filter((block) => block.activity_date >= start7);
  const checks = checks28.filter((check) => check.check_date >= start7);

  const days = Array.from({ length: 7 }, (_, index) => shiftDateKey(start7, index));
  const coverageByDay = days.map((date) => {
    const slotSet = new Set<number>();
    blocks.filter((block) => block.activity_date === date).forEach((block) => {
      for (let minute = block.start_minute; minute < block.end_minute; minute += 15) slotSet.add(minute);
    });
    return Math.round(((slotSet.size * 15) / 1440) * 100);
  });
  const weeklyCoverage = Math.round(coverageByDay.reduce((sum, value) => sum + value, 0) / 7);
  const nonEmptyDays = coverageByDay.filter((value) => value > 0).length;

  const classificationTotals = new Map<string, number>();
  let productiveMinutes = 0;
  let activityMinutes = 0;
  for (const block of blocks) {
    const category = categoryMap.get(block.category_id);
    if (!category) continue;
    const minutes = block.end_minute - block.start_minute;
    activityMinutes += minutes;
    classificationTotals.set(category.classification, (classificationTotals.get(category.classification) ?? 0) + minutes);
    if (category.classification === "productive") productiveMinutes += minutes;
  }

  const checksByHabit = new Map<string, number>();
  for (const check of checks) checksByHabit.set(check.habit_id, (checksByHabit.get(check.habit_id) ?? 0) + 1);
  const habitTarget = habitList.reduce((sum, habit) => sum + (habit.weekly_target ?? 0), 0);
  const habitDone = habitList.reduce((sum, habit) => sum + Math.min(checksByHabit.get(habit.id) ?? 0, habit.weekly_target ?? 0), 0);
  const habitCompletion = habitTarget ? Math.round((habitDone / habitTarget) * 100) : 0;

  const days28 = Array.from({ length: 28 }, (_, index) => shiftDateKey(start28, index));
  const timelineDates = new Set<string>();
  const studyByDate = new Map<string, number>();
  const exerciseByDate = new Map<string, number>();
  for (const block of blocks28) {
    const category = categoryMap.get(block.category_id);
    if (!category) continue;
    timelineDates.add(block.activity_date);
    const duration = block.end_minute - block.start_minute;
    const name = category.name.toLowerCase();
    if (name.includes("belajar")) studyByDate.set(block.activity_date, (studyByDate.get(block.activity_date) ?? 0) + duration);
    if (name.includes("olahraga") || name.includes("gym") || name.includes("lari") || name.includes("running")) exerciseByDate.set(block.activity_date, (exerciseByDate.get(block.activity_date) ?? 0) + duration);
  }
  const exerciseDays = days28.filter((date) => timelineDates.has(date) && (exerciseByDate.get(date) ?? 0) > 0);
  const nonExerciseDays = days28.filter((date) => timelineDates.has(date) && (exerciseByDate.get(date) ?? 0) === 0);
  const avgStudyExercise = exerciseDays.length ? exerciseDays.reduce((sum, date) => sum + (studyByDate.get(date) ?? 0), 0) / exerciseDays.length : 0;
  const avgStudyNoExercise = nonExerciseDays.length ? nonExerciseDays.reduce((sum, date) => sum + (studyByDate.get(date) ?? 0), 0) / nonExerciseDays.length : 0;
  const canCompareExercise = exerciseDays.length >= 3 && nonExerciseDays.length >= 3;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader eyebrow="Insights" title="Manual data patterns" description="Insight hanya memakai Timeline dan Habit yang Anda isi sendiri." action={<LiveDataBadge />} />

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Weekly coverage" value={`${weeklyCoverage}%`} detail={`${nonEmptyDays}/7 hari memiliki Timeline`} icon={<Database className="size-4" />} />
        <StatCard label="Habit completion" value={`${habitCompletion}%`} detail={`${habitDone}/${habitTarget} target mingguan`} icon={<CalendarDays className="size-4" />} />
        <StatCard label="Productive time" value={formatDuration(productiveMinutes)} detail="7 hari terakhir" icon={<Brain className="size-4" />} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">Daily data completeness</h2><p className="mt-1 text-sm text-muted-foreground">Semakin lengkap Timeline, semakin berguna insight berikutnya.</p></div><span className="font-mono text-xs text-muted-foreground">7 days</span></div>
          <div className="mt-8 flex h-52 items-end gap-3 sm:gap-5">{coverageByDay.map((value, index) => { const date = new Date(`${days[index]}T12:00:00Z`); const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date); return <div key={days[index]} className="flex flex-1 flex-col items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground">{value}%</span><div className="flex h-40 w-full items-end rounded-lg bg-muted p-1"><div className="w-full rounded-md bg-primary" style={{ height: `${value}%` }} /></div><span className="text-[10px] text-muted-foreground">{label}</span></div>; })}</div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Time classification</h2><p className="mt-1 text-sm text-muted-foreground">Berdasarkan klasifikasi kategori di Settings.</p>
          <div className="mt-5 space-y-4">{(["productive", "recovery", "leisure", "distraction", "neutral"] as const).map((name) => { const minutes = classificationTotals.get(name) ?? 0; const value = activityMinutes ? Math.round((minutes / activityMinutes) * 100) : 0; return <div key={name}><div className="flex items-center justify-between text-sm"><span className="capitalize">{name}</span><span className="font-mono text-xs text-muted-foreground">{formatDuration(minutes)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${value}%`, background: classificationColors[name] }} /></div></div>; })}</div>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Exercise day ↔ study time</h2>
        {canCompareExercise ? <p className="mt-2 text-sm leading-6 text-muted-foreground">Pada {exerciseDays.length} hari dengan olahraga, waktu belajar rata-rata <strong className="text-foreground">{formatDuration(Math.round(avgStudyExercise))}</strong>; pada {nonExerciseDays.length} hari Timeline tanpa olahraga, rata-rata <strong className="text-foreground">{formatDuration(Math.round(avgStudyNoExercise))}</strong>. Ini asosiasi deskriptif, bukan bukti sebab-akibat.</p> : <p className="mt-2 text-sm leading-6 text-muted-foreground">Perlu minimal 3 hari dengan olahraga dan 3 hari tanpa olahraga yang sama-sama memiliki Timeline. Saat ini {exerciseDays.length} vs {nonExerciseDays.length}.</p>}
      </section>
    </div>
  );
}
