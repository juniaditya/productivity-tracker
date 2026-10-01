"use client";

import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { colorPresets } from "@/lib/constants";
import { monthRange } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import type { Habit, HabitCheck } from "@/lib/types";

type Props = {
  userId: string;
  today: string;
  initialMonth: string;
  initialHabits: Habit[];
  initialChecks: HabitCheck[];
};

type Draft = {
  name: string;
  color: string;
  weekly: number;
  monthly: number;
};

function recordKey(habitId: string, date: string) {
  return `${habitId}:${date}`;
}

function checksToRecords(checks: HabitCheck[]) {
  const map: Record<string, HabitCheck> = {};
  for (const check of checks) map[recordKey(check.habit_id, check.check_date)] = check;
  return map;
}

function pct(done: number, target: number) {
  return target <= 0 ? 0 : Math.min(100, Math.round((done / target) * 100));
}

function dateKey(year: number, monthIndex: number, day: number) {
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function colorRank(color: string) {
  const index = colorPresets.indexOf(color as (typeof colorPresets)[number]);
  return index === -1 ? colorPresets.length : index;
}

function sortHabits(list: Habit[]) {
  return [...list].sort((a, b) => {
    const byColor = colorRank(a.color) - colorRank(b.color);
    if (byColor !== 0) return byColor;
    const bySort = a.sort_order - b.sort_order;
    if (bySort !== 0) return bySort;
    return a.name.localeCompare(b.name, "id");
  });
}

export function HabitPlanner({ userId, today, initialMonth, initialHabits, initialChecks }: Props) {
  const [year, initialMonthNumber] = initialMonth.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const [cursor, setCursor] = useState(() => new Date(year, initialMonthNumber - 1, 1));
  const [habits, setHabits] = useState(() => sortHabits(initialHabits.filter((habit) => habit.is_active)));
  const [records, setRecords] = useState<Record<string, HabitCheck>>(() => checksToRecords(initialChecks));
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", color: colorPresets[0], weekly: 3, monthly: 12 });

  const orderedHabits = useMemo(() => sortHabits(habits), [habits]);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(cursor);
  const isCurrentMonth = cursor.getFullYear() === todayYear && cursor.getMonth() === todayMonth - 1;
  const currentDay = isCurrentMonth ? todayDay : daysInMonth;
  const weekEnd = currentDay;
  const weekStart = Math.max(1, weekEnd - 6);
  const mobileDays = Array.from({ length: weekEnd - weekStart + 1 }, (_, i) => weekStart + i);

  function isChecked(habitId: string, key: string) {
    return records[recordKey(habitId, key)]?.checked === true;
  }

  function checkedCount(habitId: string) {
    return Object.values(records).filter((record) => record.habit_id === habitId && record.checked).length;
  }

  const summary = useMemo(() => {
    const done = orderedHabits.reduce((sum, habit) => sum + checkedCount(habit.id), 0);
    const target = orderedHabits.reduce((sum, habit) => sum + (habit.monthly_target ?? 0), 0);
    return { done, target, percent: pct(done, target) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, orderedHabits]);

  async function changeMonth(delta: number) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    const range = monthRange(next.getFullYear(), next.getMonth());
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("habit_checks")
      .select("id,habit_id,check_date,checked,source,note")
      .gte("check_date", range.start)
      .lte("check_date", range.end);
    setLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setCursor(next);
    setRecords(checksToRecords((data ?? []) as HabitCheck[]));
  }

  async function toggle(habitId: string, day: number) {
    const key = dateKey(cursor.getFullYear(), cursor.getMonth(), day);
    const mapKey = recordKey(habitId, key);
    const existing = records[mapKey];
    setSavingId(mapKey);
    setError(null);
    const supabase = createClient();

    if (existing?.checked) {
      const { error: deleteError } = await supabase.from("habit_checks").delete().eq("habit_id", habitId).eq("check_date", key);
      if (deleteError) {
        setError(deleteError.message);
        setSavingId(null);
        return;
      }
      setRecords((current) => {
        const next = { ...current };
        delete next[mapKey];
        return next;
      });
    } else {
      const { data, error: insertError } = await supabase.from("habit_checks").upsert({
        user_id: userId,
        habit_id: habitId,
        check_date: key,
        checked: true,
        source: "manual",
      }, { onConflict: "habit_id,check_date" }).select("id,habit_id,check_date,checked,source,note").single();
      if (insertError) {
        setError(insertError.message);
        setSavingId(null);
        return;
      }
      setRecords((current) => ({ ...current, [mapKey]: data as HabitCheck }));
    }

    setSavingId(null);
  }

  function startEdit(habit: Habit) {
    setEditingId(habit.id);
    setShowAdd(false);
    setDraft({ name: habit.name, color: habit.color, weekly: habit.weekly_target ?? 1, monthly: habit.monthly_target ?? 1 });
  }

  function startAdd() {
    setEditingId(null);
    setShowAdd(true);
    setDraft({ name: "", color: colorPresets[0], weekly: 3, monthly: 12 });
  }

  async function saveHabit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSavingId(editingId ?? "new");
    setError(null);
    const supabase = createClient();

    if (editingId) {
      const { data, error: updateError } = await supabase.from("habits").update({
        name: draft.name.trim(),
        color: draft.color,
        weekly_target: draft.weekly,
        monthly_target: draft.monthly,
        completion_mode: "manual",
      }).eq("id", editingId).select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").single();
      if (updateError) { setError(updateError.message); setSavingId(null); return; }
      setHabits((current) => sortHabits(current.map((habit) => habit.id === editingId ? data as Habit : habit)));
    } else {
      const { data, error: insertError } = await supabase.from("habits").insert({
        user_id: userId,
        name: draft.name.trim(),
        color: draft.color,
        completion_mode: "manual",
        weekly_target: draft.weekly,
        monthly_target: draft.monthly,
        sort_order: (habits.length + 1) * 10,
        is_active: true,
      }).select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").single();
      if (insertError) { setError(insertError.message); setSavingId(null); return; }
      setHabits((current) => sortHabits([...current, data as Habit]));
    }

    setSavingId(null);
    setEditingId(null);
    setShowAdd(false);
  }

  async function archiveHabit(habitId: string) {
    if (!window.confirm("Archive habit ini? Data historisnya tetap tersimpan.")) return;
    setSavingId(habitId);
    const supabase = createClient();
    const { error: archiveError } = await supabase.from("habits").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", habitId);
    if (archiveError) { setError(archiveError.message); setSavingId(null); return; }
    setHabits((current) => current.filter((habit) => habit.id !== habitId));
    setEditingId(null);
    setSavingId(null);
  }

  const editorVisible = showAdd || editingId;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => void changeMonth(-1)} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <div className="min-w-40 text-center text-sm font-semibold capitalize">{monthName}</div>
            <button onClick={() => void changeMonth(1)} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50" aria-label="Next month"><ChevronRight className="size-4" /></button>
            {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <button onClick={startAdd} className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background"><CirclePlus className="size-4" /> Add habit</button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><div className="flex items-center justify-between text-sm"><span className="font-medium">Monthly goal completion</span><span className="font-mono text-xs tabular-nums text-muted-foreground">{summary.done}/{summary.target} · {summary.percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${summary.percent}%` }} /></div></div>
          <p className="text-xs text-muted-foreground">Urutan dari atas mengikuti urutan warna preset. Mengubah warna habit akan memindahkan posisinya otomatis.</p>
        </div>
      </section>

      {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}

      {editorVisible ? (
        <form onSubmit={saveHabit} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{editingId ? "Edit habit" : "New habit"}</h2><p className="mt-1 text-xs text-muted-foreground">Target menentukan completion rate; semua check dilakukan manual.</p></div><button type="button" onClick={() => { setEditingId(null); setShowAdd(false); }} className="grid size-8 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">Name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={60} required className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label>
            <label className="text-sm font-medium">Weekly goal<input value={draft.weekly} onChange={(event) => setDraft((current) => ({ ...current, weekly: Math.min(7, Math.max(1, Number(event.target.value))) }))} type="number" min="1" max="7" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label>
            <label className="text-sm font-medium">Monthly goal<input value={draft.monthly} onChange={(event) => setDraft((current) => ({ ...current, monthly: Math.min(31, Math.max(1, Number(event.target.value))) }))} type="number" min="1" max="31" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label>
          </div>
          <div className="mt-4"><p className="text-sm font-medium">Color / order</p><div className="mt-2 flex flex-wrap gap-2">{colorPresets.map((color, index) => <button key={color} type="button" onClick={() => setDraft((current) => ({ ...current, color }))} className={`relative size-8 rounded-lg border-2 ${draft.color === color ? "border-foreground" : "border-transparent"}`} style={{ background: color }} aria-label={`Color ${index + 1}`}><span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-background text-[8px] font-bold text-foreground ring-1 ring-border">{index + 1}</span></button>)}</div><p className="mt-2 text-xs text-muted-foreground">Nomor warna menentukan posisi habit dari atas ke bawah.</p></div>
          <div className="mt-5 flex flex-wrap gap-2"><button disabled={savingId === (editingId ?? "new")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{savingId === (editingId ?? "new") ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save habit</button>{editingId ? <button type="button" onClick={() => void archiveHabit(editingId)} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"><Archive className="size-4" /> Archive</button> : null}</div>
        </form>
      ) : null}

      <section className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[1050px] border-collapse text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="sticky left-0 z-10 min-w-56 bg-card px-4 py-3 text-left font-medium">Habit</th>{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <th key={day} className="w-8 px-1 py-3 text-center font-mono font-medium tabular-nums">{day}</th>)}<th className="min-w-24 px-3 py-3 text-right font-medium">Month</th></tr></thead>
          <tbody>{orderedHabits.map((habit) => {
            const done = checkedCount(habit.id);
            const target = habit.monthly_target ?? 0;
            return <tr key={habit.id} className="border-b border-border/70 last:border-0"><td className="sticky left-0 z-10 bg-card px-4 py-3"><div className="flex items-center gap-2.5"><span className="size-2.5 rounded-full" style={{ background: habit.color }} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{habit.name}</p><p className="text-[10px] text-muted-foreground">{habit.weekly_target ?? "—"}/week · {habit.monthly_target ?? "—"}/month</p></div><button onClick={() => startEdit(habit)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${habit.name}`}><Pencil className="size-3.5" /></button></div></td>{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => { const key = dateKey(cursor.getFullYear(), cursor.getMonth(), day); const checked = isChecked(habit.id, key); const busy = savingId === recordKey(habit.id, key); return <td key={day} className="px-1 py-2 text-center"><button onClick={() => void toggle(habit.id, day)} disabled={busy} aria-label={`${habit.name} day ${day}`} className={`mx-auto grid size-6 place-items-center rounded-md border transition-all ${checked ? "border-transparent text-white" : "border-border hover:bg-muted"} disabled:opacity-50`} style={checked ? { background: habit.color } : undefined}>{busy ? <Loader2 className="size-3 animate-spin" /> : checked ? <Check className="size-3.5" /> : null}</button></td>; })}<td className="px-3 py-3 text-right"><div className="font-mono text-xs tabular-nums">{done}/{target}</div><div className="mt-1 text-[10px] text-muted-foreground">{pct(done, target)}%</div></td></tr>;
          })}</tbody>
        </table>
      </section>

      <section className="space-y-3 md:hidden">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground"><span>Recent days</span><span>{weekStart}–{weekEnd}</span></div>
        {orderedHabits.map((habit) => {
          const done = checkedCount(habit.id);
          const recentDone = mobileDays.filter((day) => isChecked(habit.id, dateKey(cursor.getFullYear(), cursor.getMonth(), day))).length;
          return <article key={habit.id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2.5"><span className="size-2.5 rounded-full" style={{ background: habit.color }} /><div><h3 className="font-medium">{habit.name}</h3><p className="text-xs text-muted-foreground">{habit.weekly_target ?? "—"}/week · {habit.monthly_target ?? "—"}/month</p></div></div><button onClick={() => startEdit(habit)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="size-4" /></button></div><div className="mt-4 grid grid-cols-7 gap-2">{mobileDays.map((day) => { const key = dateKey(cursor.getFullYear(), cursor.getMonth(), day); const checked = isChecked(habit.id, key); const busy = savingId === recordKey(habit.id, key); return <div key={day} className="text-center"><p className="mb-1.5 font-mono text-[10px] text-muted-foreground">{day}</p><button onClick={() => void toggle(habit.id, day)} disabled={busy} className={`mx-auto grid size-8 place-items-center rounded-lg border ${checked ? "border-transparent text-white" : "border-border"} disabled:opacity-50`} style={checked ? { background: habit.color } : undefined}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : checked ? <Check className="size-4" /> : null}</button></div>; })}</div><div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Recent {recentDone}/{mobileDays.length} · Month {done}/{habit.monthly_target ?? 0}</div></article>;
        })}
      </section>
    </div>
  );
}
