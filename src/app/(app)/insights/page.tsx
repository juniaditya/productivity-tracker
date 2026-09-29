import { Brain, CalendarDays, Database, Smartphone } from "lucide-react";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { dateKeyInTimeZone, shiftDateKey } from "@/lib/date";
import { formatDuration } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Category, Habit, HabitCheck, ScreenUsage, TimeBlock } from "@/lib/types";

const classificationColors: Record<string, string> = {
  productive: "#22c55e",
  recovery: "#6366f1",
  leisure: "#eab308",
  distraction: "#f43f5e",
  neutral: "#64748b",
};

function pearson(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (!denomX || !denomY) return null;
  return numerator / Math.sqrt(denomX * denomY);
}

function correlationLabel(value: number) {
  const abs = Math.abs(value);
  const strength = abs < 0.2 ? "sangat lemah" : abs < 0.4 ? "lemah" : abs < 0.6 ? "sedang" : abs < 0.8 ? "kuat" : "sangat kuat";
  return `${strength} ${value < 0 ? "negatif" : "positif"}`;
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: categories }, { data: habits }] = await Promise.all([
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
    supabase.from("habits").select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").eq("is_active", true).order("sort_order"),
  ]);
  const timezone = settings?.timezone ?? "Asia/Makassar";
  const today = dateKeyInTimeZone(new Date(), timezone);
  const start7 = shiftDateKey(today, -6);
  const start28 = shiftDateKey(today, -27);

  const [blocksResult, checksResult, screenResult] = await Promise.all([
    supabase.from("time_blocks").select("id,activity_date,start_minute,end_minute,category_id,note,source").gte("activity_date", start28).lte("activity_date", today),
    supabase.from("habit_checks").select("id,habit_id,check_date,checked,source,note").gte("check_date", start28).lte("check_date", today).eq("checked", true),
    supabase.from("screen_usage").select("usage_date,device,app_name,domain,duration_seconds").gte("usage_date", start28).lte("usage_date", today),
  ]);

  const blocks28 = (blocksResult.data ?? []) as TimeBlock[];
  const checks28 = (checksResult.data ?? []) as HabitCheck[];
  const screen28 = (screenResult.data ?? []) as ScreenUsage[];
  const categoryList = (categories ?? []) as Category[];
  const habitList = (habits ?? []) as Habit[];
  const categoryMap = new Map(categoryList.map((category) => [category.id, category]));

  const blocks = blocks28.filter((block) => block.activity_date >= start7);
  const checks = checks28.filter((check) => check.check_date >= start7);
  const screen = screen28.filter((item) => item.usage_date >= start7);

  const days = Array.from({ length: 7 }, (_, index) => shiftDateKey(start7, index));
  const coverageByDay = days.map((date) => {
    const slotSet = new Set<number>();
    blocks.filter((block) => block.activity_date === date).forEach((block) => {
      for (let minute = block.start_minute; minute < block.end_minute; minute += 15) slotSet.add(minute);
    });
    return Math.round(((slotSet.size * 15) / 1440) * 100);
  });
  const weeklyCoverage = Math.round(coverageByDay.reduce((sum, value) => sum + value, 0) / 7);

  const classificationTotals = new Map<string, number>();
  let productiveMinutes = 0;
  for (const block of blocks) {
    const category = categoryMap.get(block.category_id);
    if (!category) continue;
    const duration = block.end_minute - block.start_minute;
    classificationTotals.set(category.classification, (classificationTotals.get(category.classification) ?? 0) + duration);
    if (category.classification === "productive") productiveMinutes += duration;
  }
  const activityMinutes = Array.from(classificationTotals.values()).reduce((sum, value) => sum + value, 0);

  const habitTarget = habitList.reduce((sum, habit) => sum + (habit.weekly_target ?? 0), 0);
  const habitCounts = new Map<string, number>();
  for (const check of checks) habitCounts.set(check.habit_id, (habitCounts.get(check.habit_id) ?? 0) + 1);
  const habitDone = habitList.reduce((sum, habit) => sum + Math.min(habitCounts.get(habit.id) ?? 0, habit.weekly_target ?? 0), 0);
  const habitCompletion = habitTarget ? Math.round((habitDone / habitTarget) * 100) : 0;
  const totalScreenMinutes = Math.round(screen.reduce((sum, item) => sum + item.duration_seconds, 0) / 60);
  const screenAverage = Math.round(totalScreenMinutes / 7);
  const nonEmptyDays = coverageByDay.filter((value) => value > 0).length;

  const appTotals = new Map<string, number>();
  const deviceTotals = new Map<string, number>();
  for (const item of screen) {
    const app = item.app_name || item.domain || "Other";
    appTotals.set(app, (appTotals.get(app) ?? 0) + item.duration_seconds);
    const device = item.device || "Unknown device";
    deviceTotals.set(device, (deviceTotals.get(device) ?? 0) + item.duration_seconds);
  }
  const topApps = Array.from(appTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topDevices = Array.from(deviceTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const days28 = Array.from({ length: 28 }, (_, index) => shiftDateKey(start28, index));
  const productiveByDate = new Map<string, number>();
  const studyByDate = new Map<string, number>();
  const exerciseByDate = new Map<string, number>();
  const timelineDates = new Set<string>();
  const screenByDate = new Map<string, number>();
  const screenDates = new Set<string>();

  for (const block of blocks28) {
    const category = categoryMap.get(block.category_id);
    if (!category) continue;
    const duration = block.end_minute - block.start_minute;
    timelineDates.add(block.activity_date);
    if (category.classification === "productive") productiveByDate.set(block.activity_date, (productiveByDate.get(block.activity_date) ?? 0) + duration);
    const name = category.name.toLowerCase();
    if (name.includes("belajar")) studyByDate.set(block.activity_date, (studyByDate.get(block.activity_date) ?? 0) + duration);
    if (name.includes("olahraga") || name.includes("gym") || name.includes("lari") || name.includes("running")) exerciseByDate.set(block.activity_date, (exerciseByDate.get(block.activity_date) ?? 0) + duration);
  }
  for (const item of screen28) {
    screenDates.add(item.usage_date);
    screenByDate.set(item.usage_date, (screenByDate.get(item.usage_date) ?? 0) + item.duration_seconds / 60);
  }

  const matchedCorrelationDays = days28.filter((date) => timelineDates.has(date) && screenDates.has(date));
  const screenProductiveR = matchedCorrelationDays.length >= 7
    ? pearson(matchedCorrelationDays.map((date) => screenByDate.get(date) ?? 0), matchedCorrelationDays.map((date) => productiveByDate.get(date) ?? 0))
    : null;

  const exerciseDays = days28.filter((date) => timelineDates.has(date) && (exerciseByDate.get(date) ?? 0) > 0);
  const nonExerciseDays = days28.filter((date) => timelineDates.has(date) && (exerciseByDate.get(date) ?? 0) === 0);
  const avgStudyExercise = exerciseDays.length ? exerciseDays.reduce((sum, date) => sum + (studyByDate.get(date) ?? 0), 0) / exerciseDays.length : 0;
  const avgStudyNoExercise = nonExerciseDays.length ? nonExerciseDays.reduce((sum, date) => sum + (studyByDate.get(date) ?? 0), 0) / nonExerciseDays.length : 0;
  const canCompareExercise = exerciseDays.length >= 3 && nonExerciseDays.length >= 3;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Insights"
        title="Patterns, not vanity charts"
        description="Ringkasan utama memakai 7 hari; asosiasi memakai hingga 28 hari dan hanya muncul ketika sampel kedua sumber cukup."
        action={<LiveDataBadge />}
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Weekly coverage" value={`${weeklyCoverage}%`} detail={`${nonEmptyDays}/7 hari memiliki Timeline`} icon={<Database className="size-4" />} />
        <StatCard label="Habit completion" value={`${habitCompletion}%`} detail={`${habitDone}/${habitTarget} target mingguan`} icon={<CalendarDays className="size-4" />} />
        <StatCard label="Productive time" value={formatDuration(productiveMinutes)} detail="7 hari terakhir" icon={<Brain className="size-4" />} />
        <StatCard label="Screen time avg" value={formatDuration(screenAverage)} detail={screen.length ? "rata-rata 7 hari" : "belum ada import"} icon={<Smartphone className="size-4" />} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">Daily data completeness</h2><p className="mt-1 text-sm text-muted-foreground">Semakin lengkap Timeline, semakin dapat dipercaya perbandingan berikutnya.</p></div><span className="font-mono text-xs text-muted-foreground">7 days</span></div>
          <div className="mt-8 flex h-52 items-end gap-3 sm:gap-5">
            {coverageByDay.map((value, index) => {
              const date = new Date(`${days[index]}T12:00:00Z`);
              const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date);
              return <div key={days[index]} className="flex flex-1 flex-col items-center gap-2"><span className="font-mono text-[10px] text-muted-foreground">{value}%</span><div className="flex h-40 w-full items-end rounded-lg bg-muted p-1"><div className="w-full rounded-md bg-primary" style={{ height: `${value}%` }} /></div><span className="text-[10px] text-muted-foreground">{label}</span></div>;
            })}
          </div>
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Time classification</h2><p className="mt-1 text-sm text-muted-foreground">Berdasarkan klasifikasi kategori yang Anda atur di Settings.</p>
          <div className="mt-5 space-y-4">
            {(["productive", "recovery", "leisure", "distraction", "neutral"] as const).map((name) => {
              const minutes = classificationTotals.get(name) ?? 0;
              const value = activityMinutes ? Math.round((minutes / activityMinutes) * 100) : 0;
              return <div key={name}><div className="flex items-center justify-between text-sm"><span className="capitalize">{name}</span><span className="font-mono text-xs text-muted-foreground">{formatDuration(minutes)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${value}%`, background: classificationColors[name] }} /></div></div>;
            })}
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Top digital usage</h2><p className="mt-1 text-sm text-muted-foreground">7 hari dari data StayFree yang sudah diimport.</p></div><span className="font-mono text-xs text-muted-foreground">{formatDuration(totalScreenMinutes)}</span></div>
          <div className="mt-4 divide-y divide-border">{topApps.length ? topApps.map(([name, seconds]) => <div key={name} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="truncate">{name}</span><span className="font-mono text-xs text-muted-foreground">{formatDuration(Math.round(seconds / 60))}</span></div>) : <p className="py-4 text-sm text-muted-foreground">Import CSV StayFree dari Settings untuk mengaktifkan analisis digital usage.</p>}</div>
        </article>
        <article className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Usage by device</h2><p className="mt-1 text-sm text-muted-foreground">Membantu membedakan penggunaan HP, laptop, atau perangkat lain bila kolom device tersedia.</p>
          <div className="mt-4 space-y-3">{topDevices.length ? topDevices.map(([name, seconds]) => { const pctValue = totalScreenMinutes ? Math.round((seconds / 60 / totalScreenMinutes) * 100) : 0; return <div key={name}><div className="flex items-center justify-between text-sm"><span>{name}</span><span className="font-mono text-xs text-muted-foreground">{formatDuration(Math.round(seconds / 60))}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pctValue}%` }} /></div></div>; }) : <p className="text-sm text-muted-foreground">Belum ada device data.</p>}</div>
        </article>
      </section>

      <section className="mt-6">
        <div className="mb-3"><h2 className="font-semibold">Observed patterns</h2><p className="mt-1 text-sm text-muted-foreground">Deskriptif, bukan bukti sebab-akibat. Minimal 7 matched days untuk korelasi digital.</p></div>
        <div className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Screen time ↔ productive time</h3>
            {screenProductiveR === null ? <p className="mt-2 text-sm leading-6 text-muted-foreground">Belum cukup matched days yang memiliki Timeline dan StayFree sekaligus ({matchedCorrelationDays.length}/7 minimum).</p> : <p className="mt-2 text-sm leading-6 text-muted-foreground">Dari <strong className="text-foreground">{matchedCorrelationDays.length} hari</strong>, koefisien Pearson adalah <strong className="text-foreground">r={screenProductiveR.toFixed(2)}</strong>, yaitu asosiasi {correlationLabel(screenProductiveR)}.</p>}
          </article>
          <article className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold">Exercise day ↔ study time</h3>
            {canCompareExercise ? <p className="mt-2 text-sm leading-6 text-muted-foreground">Pada {exerciseDays.length} hari dengan olahraga, waktu belajar rata-rata <strong className="text-foreground">{formatDuration(Math.round(avgStudyExercise))}</strong>; pada {nonExerciseDays.length} hari Timeline tanpa olahraga, rata-rata <strong className="text-foreground">{formatDuration(Math.round(avgStudyNoExercise))}</strong>.</p> : <p className="mt-2 text-sm leading-6 text-muted-foreground">Perlu minimal 3 hari dengan olahraga dan 3 hari tanpa olahraga yang sama-sama memiliki Timeline. Saat ini {exerciseDays.length} vs {nonExerciseDays.length}.</p>}
          </article>
        </div>
      </section>
    </div>
  );
}
