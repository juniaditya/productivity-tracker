"use client";

import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { colorPresets } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { monthRange } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import type { Category, Habit, HabitCheck, HabitRule, HabitRuleStatus } from "@/lib/types";

type Props = {
  userId: string;
  today: string;
  initialMonth: string;
  initialHabits: Habit[];
  initialChecks: HabitCheck[];
  initialRules: HabitRule[];
  initialRuleStatuses: HabitRuleStatus[];
  categories: Category[];
};

type Draft = {
  name: string;
  color: string;
  weekly: number;
  monthly: number;
};

type RuleDraft = {
  source: "time_tracker" | "stayfree";
  operator: "gte" | "lte";
  threshold: number;
  categoryId: string;
  matchType: "all" | "app" | "domain" | "device";
  matchValue: string;
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

function ruleText(rule: HabitRule | undefined, categoryMap: Map<string, Category>) {
  if (!rule) return "Manual";
  const op = rule.operator === "gte" ? "≥" : "≤";
  const source = rule.source === "time_tracker"
    ? categoryMap.get(rule.category_id ?? "")?.name ?? "Timeline"
    : rule.match_type && rule.match_type !== "all"
      ? `${rule.match_type}: ${rule.match_value || "?"}`
      : "StayFree total";
  return `${source} ${op} ${formatDuration(rule.threshold_minutes)}`;
}

export function HabitPlanner({ userId, today, initialMonth, initialHabits, initialChecks, initialRules, initialRuleStatuses, categories }: Props) {
  const [year, initialMonthNumber] = initialMonth.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const [cursor, setCursor] = useState(() => new Date(year, initialMonthNumber - 1, 1));
  const [habits, setHabits] = useState(initialHabits.filter((habit) => habit.is_active));
  const [records, setRecords] = useState<Record<string, HabitCheck>>(() => checksToRecords(initialChecks));
  const [rules, setRules] = useState(initialRules);
  const [ruleStatuses, setRuleStatuses] = useState(initialRuleStatuses);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", color: colorPresets[0], weekly: 3, monthly: 12 });
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>({ source: "time_tracker", operator: "gte", threshold: 60, categoryId: categories.find((category) => category.is_active)?.id ?? "", matchType: "all", matchValue: "" });

  const activeCategories = useMemo(() => categories.filter((category) => category.is_active), [categories]);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const ruleMap = useMemo(() => new Map(rules.map((rule) => [rule.habit_id, rule])), [rules]);
  const statusMap = useMemo(() => new Map(ruleStatuses.map((status) => [status.habit_id, status])), [ruleStatuses]);

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
    const done = habits.reduce((sum, habit) => sum + checkedCount(habit.id), 0);
    const target = habits.reduce((sum, habit) => sum + (habit.monthly_target ?? 0), 0);
    return { done, target, percent: pct(done, target) };
    // records is intentionally part of the calculation through checkedCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, habits]);

  async function changeMonth(delta: number) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    const range = monthRange(next.getFullYear(), next.getMonth());
    setLoading(true);
    setError(null);
    setMessage(null);
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

  async function refreshOneCheck(habitId: string, key: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("habit_checks")
      .select("id,habit_id,check_date,checked,source,note")
      .eq("habit_id", habitId)
      .eq("check_date", key)
      .maybeSingle();
    setRecords((current) => {
      const next = { ...current };
      const mapKey = recordKey(habitId, key);
      if (data) next[mapKey] = data as HabitCheck;
      else delete next[mapKey];
      return next;
    });
  }

  async function refreshStatuses() {
    const supabase = createClient();
    const { data, error: statusError } = await supabase.rpc("evaluate_habit_rules", { p_check_date: today });
    if (!statusError) setRuleStatuses((data ?? []) as HabitRuleStatus[]);
  }

  async function toggle(habitId: string, day: number) {
    const key = dateKey(cursor.getFullYear(), cursor.getMonth(), day);
    const mapKey = recordKey(habitId, key);
    const existing = records[mapKey];
    const rule = ruleMap.get(habitId);
    setSavingId(mapKey);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    if (rule) {
      if (existing?.source === "manual_override") {
        const { error: deleteError } = await supabase.from("habit_checks").delete().eq("habit_id", habitId).eq("check_date", key);
        if (deleteError) {
          setError(deleteError.message);
          setSavingId(null);
          return;
        }
        await supabase.rpc("evaluate_habit_rules", { p_check_date: key });
      } else {
        const nextChecked = !(existing?.checked ?? false);
        const { error: overrideError } = await supabase.from("habit_checks").upsert({
          user_id: userId,
          habit_id: habitId,
          check_date: key,
          checked: nextChecked,
          source: "manual_override",
        }, { onConflict: "habit_id,check_date" });
        if (overrideError) {
          setError(overrideError.message);
          setSavingId(null);
          return;
        }
      }
    } else if (existing?.checked) {
      const { error: deleteError } = await supabase.from("habit_checks").delete().eq("habit_id", habitId).eq("check_date", key);
      if (deleteError) {
        setError(deleteError.message);
        setSavingId(null);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("habit_checks").upsert({
        user_id: userId,
        habit_id: habitId,
        check_date: key,
        checked: true,
        source: "manual",
      }, { onConflict: "habit_id,check_date" });
      if (insertError) {
        setError(insertError.message);
        setSavingId(null);
        return;
      }
    }

    await refreshOneCheck(habitId, key);
    if (key === today) await refreshStatuses();
    setSavingId(null);
  }

  function startEdit(habit: Habit) {
    setEditingId(habit.id);
    setShowAdd(false);
    setAutomationId(null);
    setDraft({ name: habit.name, color: habit.color, weekly: habit.weekly_target ?? 1, monthly: habit.monthly_target ?? 1 });
  }

  function startAdd() {
    setEditingId(null);
    setAutomationId(null);
    setShowAdd(true);
    setDraft({ name: "", color: colorPresets[0], weekly: 3, monthly: 12 });
  }

  function startAutomation(habit: Habit) {
    const rule = ruleMap.get(habit.id);
    setShowAdd(false);
    setEditingId(null);
    setAutomationId(habit.id);
    setRuleDraft(rule ? {
      source: rule.source,
      operator: rule.operator,
      threshold: rule.threshold_minutes,
      categoryId: rule.category_id ?? activeCategories[0]?.id ?? "",
      matchType: rule.match_type ?? "all",
      matchValue: rule.match_value ?? "",
    } : {
      source: "time_tracker",
      operator: "gte",
      threshold: 60,
      categoryId: activeCategories[0]?.id ?? "",
      matchType: "all",
      matchValue: "",
    });
  }

  async function saveHabit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSavingId(editingId ?? "new");
    setError(null);
    setMessage(null);
    const supabase = createClient();

    if (editingId) {
      const { data, error: updateError } = await supabase.from("habits").update({ name: draft.name.trim(), color: draft.color, weekly_target: draft.weekly, monthly_target: draft.monthly }).eq("id", editingId).select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").single();
      if (updateError) { setError(updateError.message); setSavingId(null); return; }
      setHabits((current) => current.map((habit) => habit.id === editingId ? data as Habit : habit));
    } else {
      const { data, error: insertError } = await supabase.from("habits").insert({ user_id: userId, name: draft.name.trim(), color: draft.color, completion_mode: "manual", weekly_target: draft.weekly, monthly_target: draft.monthly, sort_order: (habits.length + 1) * 10, is_active: true }).select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").single();
      if (insertError) { setError(insertError.message); setSavingId(null); return; }
      setHabits((current) => [...current, data as Habit]);
    }
    setSavingId(null);
    setEditingId(null);
    setShowAdd(false);
  }

  async function saveAutomation(event: FormEvent) {
    event.preventDefault();
    if (!automationId) return;
    if (ruleDraft.source === "time_tracker" && !ruleDraft.categoryId) {
      setError("Pilih category Timeline untuk automation ini.");
      return;
    }
    if (ruleDraft.source === "stayfree" && ruleDraft.matchType !== "all" && !ruleDraft.matchValue.trim()) {
      setError("Isi app/domain/device yang ingin dicocokkan.");
      return;
    }

    setSavingId(`rule:${automationId}`);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const payload = {
      user_id: userId,
      habit_id: automationId,
      source: ruleDraft.source,
      operator: ruleDraft.operator,
      threshold_minutes: Math.max(0, Math.min(1440, ruleDraft.threshold)),
      category_id: ruleDraft.source === "time_tracker" ? ruleDraft.categoryId : null,
      match_type: ruleDraft.source === "stayfree" ? ruleDraft.matchType : null,
      match_value: ruleDraft.source === "stayfree" && ruleDraft.matchType !== "all" ? ruleDraft.matchValue.trim() : null,
      finalize_at_day_end: ruleDraft.operator === "lte",
      is_active: true,
    };
    const { data, error: ruleError } = await supabase.from("habit_rules").upsert(payload, { onConflict: "habit_id" }).select("id,user_id,habit_id,source,operator,threshold_minutes,category_id,match_type,match_value,finalize_at_day_end,is_active").single();
    if (ruleError) { setError(ruleError.message); setSavingId(null); return; }
    await supabase.from("habits").update({ completion_mode: "hybrid" }).eq("id", automationId);
    setRules((current) => [...current.filter((rule) => rule.habit_id !== automationId), data as HabitRule]);
    setHabits((current) => current.map((habit) => habit.id === automationId ? { ...habit, completion_mode: "hybrid" } : habit));
    await refreshStatuses();
    await refreshOneCheck(automationId, today);
    setSavingId(null);
    setAutomationId(null);
    setMessage("Automation tersimpan. Timeline/StayFree berikutnya akan mengevaluasi habit ini otomatis.");
  }

  async function removeAutomation() {
    if (!automationId || !window.confirm("Hapus automation? Check manual tetap aman; check otomatis untuk habit ini akan dibersihkan.")) return;
    setSavingId(`rule:${automationId}`);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("habit_rules").delete().eq("habit_id", automationId);
    if (deleteError) { setError(deleteError.message); setSavingId(null); return; }
    await supabase.from("habit_checks").delete().eq("habit_id", automationId).in("source", ["time_rule", "stayfree_rule"]);
    await supabase.from("habits").update({ completion_mode: "manual" }).eq("id", automationId);
    setRules((current) => current.filter((rule) => rule.habit_id !== automationId));
    setHabits((current) => current.map((habit) => habit.id === automationId ? { ...habit, completion_mode: "manual" } : habit));
    setRecords((current) => Object.fromEntries(Object.entries(current).filter(([, record]) => !(record.habit_id === automationId && ["time_rule", "stayfree_rule"].includes(record.source)))));
    setRuleStatuses((current) => current.filter((status) => status.habit_id !== automationId));
    setSavingId(null);
    setAutomationId(null);
    setMessage("Automation dihapus.");
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
  const automationHabit = habits.find((habit) => habit.id === automationId);

  function sourceMarker(habitId: string, key: string) {
    const source = records[recordKey(habitId, key)]?.source;
    if (source === "time_rule" || source === "stayfree_rule") return "A";
    if (source === "manual_override") return "M";
    return "";
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><button onClick={() => void changeMonth(-1)} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50" aria-label="Previous month"><ChevronLeft className="size-4" /></button><div className="min-w-40 text-center text-sm font-semibold capitalize">{monthName}</div><button onClick={() => void changeMonth(1)} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50" aria-label="Next month"><ChevronRight className="size-4" /></button>{loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}</div>
          <button onClick={startAdd} className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background"><CirclePlus className="size-4" /> Add habit</button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"><div><div className="flex items-center justify-between text-sm"><span className="font-medium">Monthly goal completion</span><span className="font-mono text-xs tabular-nums text-muted-foreground">{summary.done}/{summary.target} · {summary.percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${summary.percent}%` }} /></div></div><p className="text-xs text-muted-foreground">Hari kosong tetap netral. A = automatic, M = manual override.</p></div>
      </section>

      {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}

      {editorVisible ? (
        <form onSubmit={saveHabit} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">{editingId ? "Edit habit" : "New habit"}</h2><p className="mt-1 text-xs text-muted-foreground">Target menentukan completion rate; tidak ada streak penalty.</p></div><button type="button" onClick={() => { setEditingId(null); setShowAdd(false); }} className="grid size-8 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-3"><label className="text-sm font-medium md:col-span-1">Name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={60} required className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label><label className="text-sm font-medium">Weekly goal<input value={draft.weekly} onChange={(event) => setDraft((current) => ({ ...current, weekly: Math.min(7, Math.max(1, Number(event.target.value))) }))} type="number" min="1" max="7" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label><label className="text-sm font-medium">Monthly goal<input value={draft.monthly} onChange={(event) => setDraft((current) => ({ ...current, monthly: Math.min(31, Math.max(1, Number(event.target.value))) }))} type="number" min="1" max="31" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label></div>
          <div className="mt-4"><p className="text-sm font-medium">Color</p><div className="mt-2 flex flex-wrap gap-2">{colorPresets.map((color) => <button key={color} type="button" onClick={() => setDraft((current) => ({ ...current, color }))} className={`size-8 rounded-lg border-2 ${draft.color === color ? "border-foreground" : "border-transparent"}`} style={{ background: color }} aria-label={`Color ${color}`} />)}</div></div>
          <div className="mt-5 flex flex-wrap gap-2"><button disabled={savingId === (editingId ?? "new")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{savingId === (editingId ?? "new") ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save habit</button>{editingId ? <button type="button" onClick={() => void archiveHabit(editingId)} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"><Archive className="size-4" /> Archive</button> : null}</div>
        </form>
      ) : null}

      {automationHabit ? (
        <form onSubmit={saveAutomation} className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Zap className="size-4 text-primary" /><h2 className="font-semibold">Automation · {automationHabit.name}</h2></div><p className="mt-1 text-xs text-muted-foreground">Satu habit memakai satu rule. Manual override tetap tersedia di matrix.</p></div><button type="button" onClick={() => setAutomationId(null)} className="grid size-8 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Source<select value={ruleDraft.source} onChange={(event) => setRuleDraft((current) => ({ ...current, source: event.target.value as RuleDraft["source"] }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3"><option value="time_tracker">Timeline category</option><option value="stayfree">StayFree</option></select></label>
            <label className="text-sm font-medium">Condition<select value={ruleDraft.operator} onChange={(event) => setRuleDraft((current) => ({ ...current, operator: event.target.value as RuleDraft["operator"] }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3"><option value="gte">At least (≥)</option><option value="lte">At most (≤)</option></select></label>
            <label className="text-sm font-medium">Threshold (minutes)<input type="number" min="0" max="1440" value={ruleDraft.threshold} onChange={(event) => setRuleDraft((current) => ({ ...current, threshold: Math.max(0, Math.min(1440, Number(event.target.value))) }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>
            {ruleDraft.source === "time_tracker" ? <label className="text-sm font-medium">Timeline category<select value={ruleDraft.categoryId} onChange={(event) => setRuleDraft((current) => ({ ...current, categoryId: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3">{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : <label className="text-sm font-medium">StayFree scope<select value={ruleDraft.matchType} onChange={(event) => setRuleDraft((current) => ({ ...current, matchType: event.target.value as RuleDraft["matchType"] }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3"><option value="all">All usage</option><option value="app">Specific app</option><option value="domain">Specific domain</option><option value="device">Specific device</option></select></label>}
          </div>
          {ruleDraft.source === "stayfree" && ruleDraft.matchType !== "all" ? <label className="mt-4 block text-sm font-medium">Exact match value<input value={ruleDraft.matchValue} onChange={(event) => setRuleDraft((current) => ({ ...current, matchValue: event.target.value }))} placeholder={ruleDraft.matchType === "app" ? "Instagram" : ruleDraft.matchType === "device" ? "Android" : "youtube.com"} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label> : null}
          <div className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">Rule ≥ dapat mencentang segera ketika threshold tercapai. Rule ≤ baru mencentang sukses setelah day cutoff; jika limit sudah terlewati, status bisa langsung menjadi failed.</div>
          <div className="mt-4 flex flex-wrap gap-2"><button disabled={savingId === `rule:${automationId}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{savingId === `rule:${automationId}` ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Save automation</button>{ruleMap.has(automationHabit.id) ? <button type="button" onClick={() => void removeAutomation()} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-500/10"><Trash2 className="size-4" /> Remove rule</button> : null}</div>
        </form>
      ) : null}

      <section className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[1050px] border-collapse text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="sticky left-0 z-10 min-w-56 bg-card px-4 py-3 text-left font-medium">Habit</th>{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => <th key={day} className="w-8 px-1 py-3 text-center font-mono font-medium tabular-nums">{day}</th>)}<th className="min-w-24 px-3 py-3 text-right font-medium">Month</th></tr></thead>
          <tbody>{habits.map((habit) => {
            const done = checkedCount(habit.id);
            const target = habit.monthly_target ?? 0;
            const rule = ruleMap.get(habit.id);
            const status = statusMap.get(habit.id);
            return <tr key={habit.id} className="border-b border-border/70 last:border-0"><td className="sticky left-0 z-10 bg-card px-4 py-3"><div className="flex items-center gap-2.5"><span className="size-2.5 rounded-full" style={{ background: habit.color }} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{habit.name}</p><p className="text-[10px] text-muted-foreground">{habit.weekly_target ?? "—"}/week · {habit.monthly_target ?? "—"}/month · {ruleText(rule, categoryMap)}</p>{status ? <p className={`mt-0.5 text-[10px] ${status.status === "complete" || status.status === "on_track" ? "text-emerald-600 dark:text-emerald-400" : status.status === "failed" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>Today {status.measured_minutes}/{status.target_minutes}m · {status.status.replace("_", " ")}</p> : null}</div><button onClick={() => startAutomation(habit)} className={`grid size-7 place-items-center rounded-md hover:bg-muted ${rule ? "text-primary" : "text-muted-foreground"}`} aria-label={`Automation ${habit.name}`}><Zap className="size-3.5" /></button><button onClick={() => startEdit(habit)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${habit.name}`}><Pencil className="size-3.5" /></button></div></td>{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => { const key = dateKey(cursor.getFullYear(), cursor.getMonth(), day); const checked = isChecked(habit.id, key); const busy = savingId === recordKey(habit.id, key); const marker = sourceMarker(habit.id, key); return <td key={day} className="px-1 py-2 text-center"><button onClick={() => void toggle(habit.id, day)} disabled={busy} title={marker === "A" ? "Automatic check" : marker === "M" ? "Manual override; click again to return to automatic" : undefined} aria-label={`${habit.name} day ${day}`} className={`relative mx-auto grid size-6 place-items-center rounded-md border transition-all ${checked ? "border-transparent text-white" : marker === "M" ? "border-amber-500/60 bg-amber-500/5" : "border-border hover:bg-muted"} disabled:opacity-50`} style={checked ? { background: habit.color } : undefined}>{busy ? <Loader2 className="size-3 animate-spin" /> : checked ? <Check className="size-3.5" /> : null}{marker ? <span className="absolute -right-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-background text-[8px] font-bold text-muted-foreground ring-1 ring-border">{marker}</span> : null}</button></td>; })}<td className="px-3 py-3 text-right"><div className="font-mono text-xs tabular-nums">{done}/{target}</div><div className="mt-1 text-[10px] text-muted-foreground">{pct(done, target)}%</div></td></tr>;
          })}</tbody>
        </table>
      </section>

      <section className="space-y-3 md:hidden">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground"><span>Recent days</span><span>{weekStart}–{weekEnd}</span></div>
        {habits.map((habit) => {
          const done = checkedCount(habit.id);
          const recentDone = mobileDays.filter((day) => isChecked(habit.id, dateKey(cursor.getFullYear(), cursor.getMonth(), day))).length;
          const rule = ruleMap.get(habit.id);
          const status = statusMap.get(habit.id);
          return <article key={habit.id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2.5"><span className="size-2.5 rounded-full" style={{ background: habit.color }} /><div><h3 className="font-medium">{habit.name}</h3><p className="text-xs text-muted-foreground">{habit.weekly_target ?? "—"}/week · {habit.monthly_target ?? "—"}/month</p><p className="mt-0.5 text-[10px] text-muted-foreground">{ruleText(rule, categoryMap)}</p>{status ? <p className={`mt-0.5 text-[10px] ${status.status === "complete" || status.status === "on_track" ? "text-emerald-600 dark:text-emerald-400" : status.status === "failed" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>{status.measured_minutes}/{status.target_minutes}m · {status.status.replace("_", " ")}</p> : null}</div></div><div className="flex"><button onClick={() => startAutomation(habit)} className={`grid size-8 place-items-center rounded-lg hover:bg-muted ${rule ? "text-primary" : "text-muted-foreground"}`}><Zap className="size-4" /></button><button onClick={() => startEdit(habit)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="size-4" /></button></div></div><div className="mt-4 grid grid-cols-7 gap-2">{mobileDays.map((day) => { const key = dateKey(cursor.getFullYear(), cursor.getMonth(), day); const checked = isChecked(habit.id, key); const busy = savingId === recordKey(habit.id, key); const marker = sourceMarker(habit.id, key); return <div key={day} className="text-center"><p className="mb-1.5 font-mono text-[10px] text-muted-foreground">{day}</p><button onClick={() => void toggle(habit.id, day)} disabled={busy} className={`relative mx-auto grid size-8 place-items-center rounded-lg border ${checked ? "border-transparent text-white" : marker === "M" ? "border-amber-500/60" : "border-border"} disabled:opacity-50`} style={checked ? { background: habit.color } : undefined}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : checked ? <Check className="size-4" /> : null}{marker ? <span className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full bg-background text-[8px] font-bold ring-1 ring-border">{marker}</span> : null}</button></div>; })}</div><div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span>Recent {recentDone}/{mobileDays.length} · Month {done}/{habit.monthly_target ?? 0}</span>{rule && Object.values(records).some((record) => record.habit_id === habit.id && record.source === "manual_override") ? <span className="inline-flex items-center gap-1"><RotateCcw className="size-3" /> M = override</span> : null}</div></article>;
        })}
      </section>
    </div>
  );
}
