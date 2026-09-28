"use client";

import { ChevronLeft, ChevronRight, Eraser, MousePointer2, Paintbrush, Save } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { categoryPresets } from "@/lib/constants";
import { formatDuration, minuteLabel } from "@/lib/format";

type Mode = "paint" | "erase" | "select";
type SlotMap = Record<number, string[]>;

const colors = Object.fromEntries(categoryPresets.map((c) => [c.name, c.color]));

function buildDemoSlots(): SlotMap {
  const data: SlotMap = {};
  const fill = (from: number, to: number, category: string) => {
    for (let minute = from; minute < to; minute += 15) {
      const slot = minute / 15;
      data[slot] = [...(data[slot] ?? []), category].slice(0, 2);
    }
  };
  fill(0, 390, "Tidur");
  fill(420, 480, "Personal");
  fill(480, 600, "Belajar");
  fill(630, 750, "Kerja");
  fill(750, 795, "Makan");
  fill(810, 930, "Kerja");
  fill(960, 1020, "Olahraga");
  fill(1110, 1200, "Main HP");
  fill(1125, 1185, "Hiburan");
  return data;
}

function cellBackground(entries: string[]) {
  if (!entries.length) return "transparent";
  if (entries.length === 1) return colors[entries[0]] ?? "#71717a";
  const c1 = colors[entries[0]] ?? "#71717a";
  const c2 = colors[entries[1]] ?? "#52525b";
  return `linear-gradient(135deg, ${c1} 0 50%, ${c2} 50% 100%)`;
}

export function TimelineEditor() {
  const [slots, setSlots] = useState<SlotMap>(() => buildDemoSlots());
  const [selected, setSelected] = useState("Belajar");
  const [mode, setMode] = useState<Mode>("paint");
  const dragging = useRef(false);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(slots).forEach((entries) => entries.forEach((name) => (map[name] = (map[name] ?? 0) + 15)));
    return map;
  }, [slots]);

  const tracked = Object.values(slots).filter((entries) => entries.length > 0).length * 15;

  function apply(slot: number) {
    if (mode === "select") return;
    setSlots((current) => {
      const next = { ...current };
      const entries = [...(next[slot] ?? [])];
      if (mode === "paint") {
        if (!entries.includes(selected) && entries.length < 2) entries.push(selected);
      } else {
        const index = entries.indexOf(selected);
        if (index >= 0) entries.splice(index, 1);
      }
      if (entries.length) next[slot] = entries;
      else delete next[slot];
      return next;
    });
  }

  return (
    <div onPointerUp={() => (dragging.current = false)} onPointerCancel={() => (dragging.current = false)}>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Previous day"><ChevronLeft className="size-4" /></button>
          <button className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Today</button>
          <button className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Next day"><ChevronRight className="size-4" /></button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Coverage</span>
          <span className="font-mono font-medium tabular-nums">{formatDuration(tracked)} · {Math.round((tracked / 1440) * 100)}%</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_300px]">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="sticky top-0 z-10 border-b border-border bg-card/95 p-3 backdrop-blur">
            <div className="flex flex-wrap gap-2">
              {categoryPresets.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setSelected(category.name)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected === category.name ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                >
                  <span className="size-2 rounded-full" style={{ background: category.color }} />
                  {category.name}
                </button>
              ))}
            </div>
            <div className="mt-3 inline-flex rounded-lg border border-border bg-muted/50 p-1">
              {([
                ["select", MousePointer2, "Select"],
                ["paint", Paintbrush, "Isi"],
                ["erase", Eraser, "Hapus"],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-[52px_1fr] gap-x-3">
              {Array.from({ length: 96 }, (_, slot) => {
                const minute = slot * 15;
                const hourMark = minute % 60 === 0;
                const entries = slots[slot] ?? [];
                return (
                  <div key={slot} className="contents">
                    <div className={`flex h-4 items-start justify-end pr-1 font-mono text-[10px] tabular-nums ${hourMark ? "text-muted-foreground" : "text-transparent"}`}>
                      {hourMark ? minuteLabel(minute) : "·"}
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${minuteLabel(minute)} ${entries.join(", ") || "empty"}`}
                      onPointerDown={(event) => {
                        if (mode === "select") return;
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        dragging.current = true;
                        apply(slot);
                      }}
                      onPointerEnter={() => {
                        if (dragging.current) apply(slot);
                      }}
                      onClick={() => mode !== "select" && apply(slot)}
                      className={`h-4 touch-none border-t transition-[filter] hover:brightness-110 ${hourMark ? "border-border" : "border-border/35"}`}
                      style={{ background: cellBackground(entries) }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Day totals</h2>
              <span className="font-mono text-xs text-muted-foreground">activity time</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, minutes]) => (
                <div key={name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate"><span className="size-2 rounded-full" style={{ background: colors[name] }} />{name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(minutes)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">15-minute rules</h2>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-muted-foreground">
              <li>• 96 slots per day.</li>
              <li>• Maximum 2 categories can overlap in one slot.</li>
              <li>• Clock coverage counts each slot once.</li>
              <li>• Category totals count every selected activity.</li>
            </ul>
          </div>

          <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            <Save className="size-4" /> Save changes
          </button>
        </aside>
      </div>
    </div>
  );
}
