"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Loader2,
  MousePointer2,
  Paintbrush,
  Save,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatDateKey, shiftDateKey } from "@/lib/date";
import { formatDuration, minuteLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Category, TimeBlock } from "@/lib/types";

type Mode = "paint" | "erase" | "select";
type SlotMap = Record<number, string[]>;
type NoteMap = Record<string, string>;

type Props = {
  initialDate: string;
  initialCategories: Category[];
  initialBlocks: TimeBlock[];
};

function blockState(blocks: TimeBlock[]) {
  const slots: SlotMap = {};
  const notes: NoteMap = {};
  for (const block of blocks) {
    for (let minute = block.start_minute; minute < block.end_minute; minute += 15) {
      const slot = minute / 15;
      const entries = slots[slot] ?? [];
      if (!entries.includes(block.category_id) && entries.length < 2) {
        slots[slot] = [...entries, block.category_id];
      }
      if (block.note) notes[`${slot}:${block.category_id}`] = block.note;
    }
  }
  return { slots, notes };
}

function slotsToBlocks(slots: SlotMap, notes: NoteMap, date: string) {
  const categoryIds = Array.from(new Set(Object.values(slots).flat()));
  const blocks: Array<Omit<TimeBlock, "id">> = [];

  for (const categoryId of categoryIds) {
    let start: number | null = null;
    let currentNote = "";
    for (let slot = 0; slot <= 96; slot++) {
      const active = slot < 96 && (slots[slot] ?? []).includes(categoryId);
      const note = active ? (notes[`${slot}:${categoryId}`] ?? "") : "";
      if (active && start === null) {
        start = slot * 15;
        currentNote = note;
      } else if (active && start !== null && note !== currentNote) {
        blocks.push({ activity_date: date, start_minute: start, end_minute: slot * 15, category_id: categoryId, note: currentNote || null, source: "manual" });
        start = slot * 15;
        currentNote = note;
      } else if (!active && start !== null) {
        blocks.push({ activity_date: date, start_minute: start, end_minute: slot * 15, category_id: categoryId, note: currentNote || null, source: "manual" });
        start = null;
        currentNote = "";
      }
    }
  }

  return blocks.sort((a, b) => a.start_minute - b.start_minute || a.category_id.localeCompare(b.category_id));
}

export function TimelineEditor({ initialDate, initialCategories, initialBlocks }: Props) {
  const categories = initialCategories;
  const activeCategories = useMemo(() => categories.filter((category) => category.is_active), [categories]);
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const initialState = useMemo(() => blockState(initialBlocks), [initialBlocks]);
  const [cursor, setCursor] = useState(initialDate);
  const [slots, setSlots] = useState<SlotMap>(() => initialState.slots);
  const [notes, setNotes] = useState<NoteMap>(() => initialState.notes);
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [selected, setSelected] = useState(activeCategories[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("paint");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef(false);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(slots).forEach((entries) =>
      entries.forEach((categoryId) => {
        map[categoryId] = (map[categoryId] ?? 0) + 15;
      }),
    );
    return map;
  }, [slots]);

  const tracked = Object.values(slots).filter((entries) => entries.length > 0).length * 15;

  function cellBackground(entries: string[]) {
    if (!entries.length) return "transparent";
    if (entries.length === 1) return categoryMap.get(entries[0])?.color ?? "#71717a";
    const c1 = categoryMap.get(entries[0])?.color ?? "#71717a";
    const c2 = categoryMap.get(entries[1])?.color ?? "#52525b";
    return `linear-gradient(135deg, ${c1} 0 50%, ${c2} 50% 100%)`;
  }

  function apply(slot: number) {
    if (mode === "select" || !selected) return;
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
    if (mode === "erase") {
      setNotes((currentNotes) => {
        const nextNotes = { ...currentNotes };
        delete nextNotes[`${slot}:${selected}`];
        return nextNotes;
      });
    }
    setDirty(true);
    setMessage(null);
  }

  async function loadDate(nextDate: string) {
    if (dirty && !window.confirm("Ada perubahan yang belum disimpan. Pindah tanggal dan buang perubahan?")) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("time_blocks")
      .select("id,activity_date,start_minute,end_minute,category_id,note,source")
      .eq("activity_date", nextDate)
      .order("start_minute");
    setLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setCursor(nextDate);
    const nextState = blockState((data ?? []) as TimeBlock[]);
    setSlots(nextState.slots);
    setNotes(nextState.notes);
    setFocusedSlot(null);
    setDirty(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const blocks = slotsToBlocks(slots, notes, cursor).map((block) => ({
      start_minute: block.start_minute,
      end_minute: block.end_minute,
      category_id: block.category_id,
      note: block.note,
    }));
    const { error: saveError } = await supabase.rpc("save_day_time_blocks", {
      p_activity_date: cursor,
      p_blocks: blocks,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setDirty(false);
    setMessage("Tersimpan ke Supabase");
  }

  function setRunNote(categoryId: string, slot: number, value: string) {
    let left = slot;
    let right = slot;
    while (left > 0 && (slots[left - 1] ?? []).includes(categoryId)) left--;
    while (right < 95 && (slots[right + 1] ?? []).includes(categoryId)) right++;
    setNotes((current) => {
      const next = { ...current };
      for (let index = left; index <= right; index++) {
        const key = `${index}:${categoryId}`;
        if (value.trim()) next[key] = value;
        else delete next[key];
      }
      return next;
    });
    setDirty(true);
    setMessage(null);
  }

  return (
    <div
      onPointerMove={(event) => {
        if (!dragging.current || mode === "select") return;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-timeline-slot]");
        const slotValue = target?.dataset.timelineSlot;
        if (slotValue) apply(Number(slotValue));
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => loadDate(shiftDateKey(cursor, -1))} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50" aria-label="Previous day"><ChevronLeft className="size-4" /></button>
          <button onClick={() => loadDate(initialDate)} disabled={loading} className="min-w-44 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{formatDateKey(cursor, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</button>
          <button onClick={() => loadDate(shiftDateKey(cursor, 1))} disabled={loading} className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50" aria-label="Next day"><ChevronRight className="size-4" /></button>
          {cursor !== initialDate ? <button onClick={() => loadDate(initialDate)} className="rounded-lg px-2 py-2 text-xs font-medium text-primary hover:bg-muted">Today</button> : null}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {loading ? <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading</span> : null}
          {dirty ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved</span> : null}
          <span className="text-muted-foreground">Coverage</span>
          <span className="font-mono font-medium tabular-nums">{formatDuration(tracked)} · {Math.round((tracked / 1440) * 100)}%</span>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {message ? <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" /> {message}</div> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_300px]">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="sticky top-0 z-10 border-b border-border bg-card/95 p-3 backdrop-blur">
            <div className="flex flex-wrap gap-2">
              {activeCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelected(category.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected === category.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
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
                const names = entries.map((id) => categoryMap.get(id)?.name).filter(Boolean).join(", ");
                return (
                  <div key={slot} className="contents">
                    <div className={`flex h-4 items-start justify-end pr-1 font-mono text-[10px] tabular-nums ${hourMark ? "text-muted-foreground" : "text-transparent"}`}>
                      {hourMark ? minuteLabel(minute) : "·"}
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${minuteLabel(minute)} ${names || "empty"}`}
                      data-timeline-slot={slot}
                      onPointerDown={() => {
                        if (mode === "select") {
                          setFocusedSlot(slot);
                          return;
                        }
                        dragging.current = true;
                        apply(slot);
                      }}
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
              {Object.entries(totals).length ? Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([categoryId, minutes]) => {
                const category = categoryMap.get(categoryId);
                if (!category) return null;
                return (
                  <div key={categoryId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 truncate"><span className="size-2 rounded-full" style={{ background: category.color }} />{category.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(minutes)}</span>
                  </div>
                );
              }) : <p className="text-sm text-muted-foreground">Belum ada aktivitas pada tanggal ini.</p>}
            </div>
          </div>

          {focusedSlot !== null ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-semibold">Block note</h2><p className="mt-1 font-mono text-xs text-muted-foreground">{minuteLabel(focusedSlot * 15)}</p></div>
                <button onClick={() => setFocusedSlot(null)} className="text-xs font-medium text-muted-foreground hover:text-foreground">Close</button>
              </div>
              <div className="mt-3 space-y-3">
                {(slots[focusedSlot] ?? []).length ? (slots[focusedSlot] ?? []).map((categoryId) => {
                  const category = categoryMap.get(categoryId);
                  if (!category) return null;
                  return (
                    <label key={categoryId} className="block text-xs font-medium">
                      <span className="mb-1.5 flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: category.color }} />{category.name}</span>
                      <textarea
                        value={notes[`${focusedSlot}:${categoryId}`] ?? ""}
                        onChange={(event) => setRunNote(categoryId, focusedSlot, event.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Catatan opsional untuk block ini…"
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary"
                      />
                    </label>
                  );
                }) : <p className="text-sm text-muted-foreground">Slot ini kosong. Pilih slot berwarna untuk memberi catatan.</p>}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">15-minute rules</h2>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-muted-foreground">
              <li>• 96 slot per hari.</li>
              <li>• Maksimum 2 aktivitas overlap pada satu slot.</li>
              <li>• Coverage menghitung waktu unik, bukan jumlah aktivitas.</li>
              <li>• Save mengganti data tanggal ini secara atomik.</li>
            </ul>
          </div>

          <button onClick={save} disabled={saving || !dirty} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </aside>
      </div>
    </div>
  );
}
