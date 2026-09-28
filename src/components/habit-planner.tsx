"use client";

import { Check, ChevronLeft, ChevronRight, CirclePlus, MoreHorizontal, NotebookPen } from "lucide-react";
import { useMemo, useState } from "react";

const habitDefs = [
  { id: "japanese", name: "Japanese", color: "#8b5cf6", weekly: 7, monthly: 28 },
  { id: "anki", name: "Anki", color: "#3b82f6", weekly: 7, monthly: 28 },
  { id: "gym", name: "Gym", color: "#22c55e", weekly: 4, monthly: 16 },
  { id: "running", name: "Running", color: "#14b8a6", weekly: 3, monthly: 12 },
  { id: "reading", name: "Reading", color: "#f59e0b", weekly: 5, monthly: 20 },
  { id: "journal", name: "Journal", color: "#06b6d4", weekly: 5, monthly: 20 },
  { id: "skincare", name: "Skincare", color: "#ec4899", weekly: 7, monthly: 28 },
  { id: "vitamin", name: "Vitamin", color: "#84cc16", weekly: 7, monthly: 28 },
  { id: "no-sugar", name: "No sugar", color: "#f97316", weekly: 5, monthly: 20 },
  { id: "stretch", name: "Stretch", color: "#6366f1", weekly: 4, monthly: 16 },
] as const;

function makeSeed(days: number) {
  const map: Record<string, Set<number>> = {};
  habitDefs.forEach((habit, index) => {
    const set = new Set<number>();
    for (let day = 1; day <= days; day++) {
      const rule = (day * (index + 2) + index) % 7;
      const threshold = habit.weekly >= 7 ? 6 : Math.max(2, Math.round((habit.weekly / 7) * 6));
      if (rule < threshold && day <= new Date().getDate()) set.add(day);
    }
    map[habit.id] = set;
  });
  return map;
}

function pct(done: number, target: number) {
  return target <= 0 ? 0 : Math.min(100, Math.round((done / target) * 100));
}

export function HabitPlanner() {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const [checks, setChecks] = useState<Record<string, Set<number>>>(() => makeSeed(daysInMonth));
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(cursor);

  const currentDay = cursor.getMonth() === now.getMonth() && cursor.getFullYear() === now.getFullYear() ? now.getDate() : daysInMonth;
  const weekEnd = currentDay;
  const weekStart = Math.max(1, weekEnd - 6);
  const mobileDays = Array.from({ length: weekEnd - weekStart + 1 }, (_, i) => weekStart + i);

  const summary = useMemo(() => {
    const done = habitDefs.reduce((sum, habit) => sum + (checks[habit.id]?.size ?? 0), 0);
    const target = habitDefs.reduce((sum, habit) => sum + habit.monthly, 0);
    return { done, target, percent: pct(done, target) };
  }, [checks]);

  function toggle(habitId: string, day: number) {
    setChecks((current) => {
      const next = { ...current };
      const set = new Set(next[habitId] ?? []);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      next[habitId] = set;
      return next;
    });
  }

  function changeMonth(delta: number) {
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <div className="min-w-40 text-center text-sm font-semibold capitalize">{monthName}</div>
            <button onClick={() => changeMonth(1)} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Next month"><ChevronRight className="size-4" /></button>
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background">
            <CirclePlus className="size-4" /> Add habit
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Monthly goal completion</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{summary.done}/{summary.target} · {summary.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${summary.percent}%` }} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Unchecked days are neutral; progress is measured against weekly/monthly targets.</p>
        </div>
      </section>

      <section className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[1050px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-40 bg-card px-4 py-3 text-left font-medium">Habit</th>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                <th key={day} className="w-8 px-1 py-3 text-center font-mono font-medium tabular-nums">{day}</th>
              ))}
              <th className="min-w-24 px-3 py-3 text-right font-medium">Month</th>
            </tr>
          </thead>
          <tbody>
            {habitDefs.map((habit) => {
              const done = checks[habit.id]?.size ?? 0;
              return (
                <tr key={habit.id} className="border-b border-border/70 last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="size-2.5 rounded-full" style={{ background: habit.color }} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{habit.name}</p>
                        <p className="text-[10px] text-muted-foreground">{habit.weekly}/week · {habit.monthly}/month</p>
                      </div>
                    </div>
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                    const checked = checks[habit.id]?.has(day);
                    return (
                      <td key={day} className="px-1 py-2 text-center">
                        <button
                          onClick={() => toggle(habit.id, day)}
                          aria-label={`${habit.name} day ${day}`}
                          className={`mx-auto grid size-6 place-items-center rounded-md border transition-all ${checked ? "border-transparent text-white" : "border-border hover:bg-muted"}`}
                          style={checked ? { background: habit.color } : undefined}
                        >
                          {checked ? <Check className="size-3.5" /> : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right">
                    <div className="font-mono text-xs tabular-nums">{done}/{habit.monthly}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{pct(done, habit.monthly)}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3 md:hidden">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>Recent 7 days</span>
          <span>{weekStart}–{weekEnd}</span>
        </div>
        {habitDefs.map((habit) => {
          const done = checks[habit.id]?.size ?? 0;
          const recentDone = mobileDays.filter((day) => checks[habit.id]?.has(day)).length;
          return (
            <article key={habit.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full" style={{ background: habit.color }} />
                  <div>
                    <h3 className="font-medium">{habit.name}</h3>
                    <p className="text-xs text-muted-foreground">{habit.weekly}/week · {habit.monthly}/month</p>
                  </div>
                </div>
                <button className="text-muted-foreground"><MoreHorizontal className="size-4" /></button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-2">
                {mobileDays.map((day) => {
                  const checked = checks[habit.id]?.has(day);
                  return (
                    <div key={day} className="text-center">
                      <p className="mb-1.5 font-mono text-[10px] text-muted-foreground">{day}</p>
                      <button
                        onClick={() => toggle(habit.id, day)}
                        className={`mx-auto grid size-8 place-items-center rounded-lg border ${checked ? "border-transparent text-white" : "border-border"}`}
                        style={checked ? { background: habit.color } : undefined}
                      >
                        {checked ? <Check className="size-4" /> : null}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                <span className="text-muted-foreground">Recent {recentDone}/{mobileDays.length} · Month {done}/{habit.monthly}</span>
                <button className="inline-flex items-center gap-1.5 text-muted-foreground"><NotebookPen className="size-3.5" /> Note</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
