"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dateKeyInTimeZone,
  formatDateKey,
  shiftDateKey,
  sundayWeekRange,
} from "@/lib/date";
import { formatDuration, minuteLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Category, TimeBlock } from "@/lib/types";

type ViewMode = "week" | "day";

type CalendarBlock = TimeBlock & {
  client_id: string;
};

type EditorDraft = {
  client_id: string;
  activity_date: string;
  start_minute: number;
  end_minute: number;
  category_id: string;
  title: string;
  note: string;
};

type Interaction =
  | {
      type: "create";
      pointerId: number;
      blockId: string;
      anchorMinute: number;
      original: CalendarBlock;
      moved: boolean;
    }
  | {
      type: "move";
      pointerId: number;
      blockId: string;
      original: CalendarBlock;
      startClientX: number;
      startClientY: number;
      moved: boolean;
    }
  | {
      type: "resize-start" | "resize-end";
      pointerId: number;
      blockId: string;
      original: CalendarBlock;
      moved: boolean;
    };


type PendingMobileTouch = {
  pointerId: number;
  blockId: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  longPressed: boolean;
};

type SavePayloadDay = {
  activity_date: string;
  blocks: Array<{
    start_minute: number;
    end_minute: number;
    category_id: string;
    title: string | null;
    note: string | null;
  }>;
};

type Props = {
  initialDate: string;
  initialRangeStart: string;
  timezone: string;
  initialCategories: Category[];
  initialBlocks: TimeBlock[];
};

const HOUR_HEIGHT = 64;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const MINUTE_PX = HOUR_HEIGHT / 60;
const SNAP = 15;
const MIN_DURATION = 15;
const MOBILE_HOLD_MS = 420;
const MOBILE_SCROLL_THRESHOLD = 10;

function makeClientId(block?: TimeBlock) {
  if (block?.id) return `db:${block.id}`;
  return `local:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function hydrateBlocks(blocks: TimeBlock[]): CalendarBlock[] {
  return blocks.map((block) => ({
    ...block,
    title: block.title ?? null,
    client_id: makeClientId(block),
  }));
}

function snapMinute(value: number) {
  return Math.max(0, Math.min(1440, Math.round(value / SNAP) * SNAP));
}

function snapDelta(value: number) {
  return Math.round(value / SNAP) * SNAP;
}

function clampBlockStart(value: number, duration: number) {
  return Math.max(0, Math.min(1440 - duration, snapMinute(value)));
}

function minutesFromPointer(clientY: number, grid: HTMLElement) {
  const rect = grid.getBoundingClientRect();
  return snapMinute((clientY - rect.top) / MINUTE_PX);
}

function minuteToInput(minute: number) {
  const safe = Math.max(0, Math.min(1439, minute));
  const hours = Math.floor(safe / 60).toString().padStart(2, "0");
  const minutes = (safe % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function inputToMinute(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return snapMinute(hours * 60 + minutes);
}

function textColor(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#ffffff";
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.64 ? "#111827" : "#ffffff";
}

function overlaps(a: CalendarBlock, b: CalendarBlock) {
  return a.activity_date === b.activity_date && a.start_minute < b.end_minute && a.end_minute > b.start_minute;
}

function canPlace(candidate: CalendarBlock, blocks: CalendarBlock[]) {
  for (let minute = candidate.start_minute; minute < candidate.end_minute; minute += SNAP) {
    const others = blocks.filter(
      (block) =>
        block.client_id !== candidate.client_id &&
        block.activity_date === candidate.activity_date &&
        block.start_minute <= minute &&
        block.end_minute > minute,
    );
    if (others.length >= 2) return false;
  }
  return true;
}

function dayLayout(blocks: CalendarBlock[]) {
  const sorted = [...blocks].sort(
    (a, b) => a.start_minute - b.start_minute || a.end_minute - b.end_minute,
  );
  const laneEnd = [-1, -1];
  const layout = new Map<string, { lane: number; split: boolean }>();

  for (const block of sorted) {
    const lane = laneEnd[0] <= block.start_minute ? 0 : 1;
    laneEnd[lane] = block.end_minute;
    const split = sorted.some(
      (other) => other.client_id !== block.client_id && overlaps(block, other),
    );
    layout.set(block.client_id, { lane, split });
  }

  return layout;
}

function formatCompactDate(dateKey: string) {
  return formatDateKey(dateKey, { weekday: "short", day: "numeric", month: "short" });
}

function getCurrentMinute(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour ?? 0) * 60 + Number(values.minute ?? 0);
}

async function postDays(days: SavePayloadDay[], keepalive = false) {
  const response = await fetch("/api/timeline/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive,
    body: JSON.stringify({ days }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Timeline save failed.");
}

export function TimelineEditor({
  initialDate,
  initialRangeStart,
  timezone,
  initialCategories,
  initialBlocks,
}: Props) {
  const router = useRouter();
  const activeCategories = useMemo(
    () => initialCategories.filter((category) => category.is_active),
    [initialCategories],
  );
  const categoryMap = useMemo(
    () => new Map(initialCategories.map((category) => [category.id, category])),
    [initialCategories],
  );

  const [blocks, setBlocks] = useState<CalendarBlock[]>(() => hydrateBlocks(initialBlocks));
  const blocksRef = useRef(blocks);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [rangeStart, setRangeStart] = useState(initialRangeStart);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const viewTouched = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState(activeCategories[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(() => new Set());
  const dirtyDatesRef = useRef<Set<string>>(new Set());
  const dateVersionsRef = useRef<Record<string, number>>({});
  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true));
  const interactionRef = useRef<Interaction | null>(null);
  const pendingMobileTouchRef = useRef<PendingMobileTouch | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const [isMobileInput, setIsMobileInput] = useState(false);
  const [armedBlockId, setArmedBlockId] = useState<string | null>(null);

  blocksRef.current = blocks;
  dirtyDatesRef.current = dirtyDates;

  const rangeEnd = shiftDateKey(rangeStart, 6);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDateKey(rangeStart, index)),
    [rangeStart],
  );
  const visibleDates = viewMode === "week" ? weekDates : [selectedDate];
  const todayKey = dateKeyInTimeZone(new Date(), timezone);
  const currentMinute = useMemo(() => getCurrentMinute(timezone), [timezone, clockTick]);
  const busy = pendingSaves > 0;

  const visibleBlocks = useMemo(
    () => blocks.filter((block) => visibleDates.includes(block.activity_date)),
    [blocks, visibleDates],
  );

  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const block of blocks.filter((item) => item.activity_date === selectedDate)) {
      totals.set(block.category_id, (totals.get(block.category_id) ?? 0) + block.end_minute - block.start_minute);
    }
    return totals;
  }, [blocks, selectedDate]);

  const selectedCoverage = useMemo(() => {
    const occupied = new Set<number>();
    for (const block of blocks.filter((item) => item.activity_date === selectedDate)) {
      for (let minute = block.start_minute; minute < block.end_minute; minute += SNAP) occupied.add(minute);
    }
    return occupied.size * SNAP;
  }, [blocks, selectedDate]);

  useEffect(() => {
    const widthMedia = window.matchMedia("(max-width: 767px)");
    const pointerMedia = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      if (!viewTouched.current) setViewMode(widthMedia.matches ? "day" : "week");
      setIsMobileInput(widthMedia.matches && pointerMedia.matches);
    };
    apply();
    widthMedia.addEventListener("change", apply);
    pointerMedia.addEventListener("change", apply);
    return () => {
      widthMedia.removeEventListener("change", apply);
      pointerMedia.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const targetMinute = visibleDates.includes(todayKey) ? Math.max(0, currentMinute - 120) : 240;
    scrollRef.current.scrollTop = targetMinute * MINUTE_PX;
    // Scroll only on the first calendar mount / range change, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, viewMode]);

  function setView(mode: ViewMode) {
    viewTouched.current = true;
    setViewMode(mode);
  }

  function markDatesDirty(...dates: string[]) {
    setMessage(null);
    setDirtyDates((current) => {
      const next = new Set(current);
      for (const date of dates) {
        next.add(date);
        dateVersionsRef.current[date] = (dateVersionsRef.current[date] ?? 0) + 1;
      }
      dirtyDatesRef.current = next;
      return next;
    });
  }

  function serializeDate(date: string, sourceBlocks = blocksRef.current): SavePayloadDay {
    return {
      activity_date: date,
      blocks: sourceBlocks
        .filter((block) => block.activity_date === date)
        .sort((a, b) => a.start_minute - b.start_minute || a.end_minute - b.end_minute)
        .map((block) => ({
          start_minute: block.start_minute,
          end_minute: block.end_minute,
          category_id: block.category_id,
          title: block.title?.trim() || categoryMap.get(block.category_id)?.name || null,
          note: block.note?.trim() || null,
        })),
    };
  }

  const queueSave = useCallback(
    (silent = false) => {
      const dates = Array.from(dirtyDatesRef.current);
      if (!dates.length) {
        if (!silent) setMessage("Semua perubahan sudah tersimpan.");
        return saveChain.current;
      }

      const blockSnapshot = blocksRef.current.map((block) => ({ ...block }));
      const payload = dates.map((date) => serializeDate(date, blockSnapshot));
      const versions = Object.fromEntries(dates.map((date) => [date, dateVersionsRef.current[date] ?? 0]));

      setPendingSaves((value) => value + 1);
      setError(null);
      if (!silent) setMessage(null);

      const task = saveChain.current.then(async () => {
        try {
          await postDays(payload);
          setDirtyDates((current) => {
            const next = new Set(current);
            for (const date of dates) {
              if ((dateVersionsRef.current[date] ?? 0) === versions[date]) next.delete(date);
            }
            dirtyDatesRef.current = next;
            return next;
          });
          setMessage(silent ? "Autosaved" : "Tersimpan");
          return true;
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : "Timeline save failed.");
          return false;
        } finally {
          setPendingSaves((value) => Math.max(0, value - 1));
        }
      });

      saveChain.current = task;
      return task;
    },
    // categoryMap only changes if Settings data changes after a navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryMap],
  );

  useEffect(() => {
    if (!dirtyDates.size || loading) return;
    const timer = window.setTimeout(() => void queueSave(true), 550);
    return () => window.clearTimeout(timer);
  }, [blocks, dirtyDates, loading, queueSave]);

  useEffect(() => {
    const navigate = async (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      const ok = dirtyDatesRef.current.size ? await queueSave(true) : await saveChain.current;
      if (!ok) {
        window.dispatchEvent(new Event("focus-ledger:navigation-cancelled"));
        return;
      }
      router.push(href);
    };
    window.addEventListener("focus-ledger:timeline-navigate", navigate);
    return () => window.removeEventListener("focus-ledger:timeline-navigate", navigate);
  }, [queueSave, router]);

  useEffect(() => {
    const emergencySave = () => {
      const dates = Array.from(dirtyDatesRef.current);
      if (!dates.length) return;
      const payload = dates.map((date) => serializeDate(date, blocksRef.current));
      void postDays(payload, true).catch(() => undefined);
    };
    window.addEventListener("pagehide", emergencySave);
    window.addEventListener("beforeunload", emergencySave);
    return () => {
      window.removeEventListener("pagehide", emergencySave);
      window.removeEventListener("beforeunload", emergencySave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryMap]);

  async function fetchWeek(anchorDate: string) {
    const ok = dirtyDatesRef.current.size ? await queueSave(true) : await saveChain.current;
    if (!ok) return false;

    const nextRange = sundayWeekRange(anchorDate);
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("time_blocks")
      .select("id,activity_date,start_minute,end_minute,category_id,title,note,source")
      .gte("activity_date", nextRange.start)
      .lte("activity_date", nextRange.end)
      .order("activity_date")
      .order("start_minute");
    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return false;
    }

    setRangeStart(nextRange.start);
    const nextBlocks = hydrateBlocks((data ?? []) as TimeBlock[]);
    blocksRef.current = nextBlocks;
    setBlocks(nextBlocks);
    setDirtyDates(new Set());
    dirtyDatesRef.current = new Set();
    dateVersionsRef.current = {};
    return true;
  }

  async function goToDate(date: string) {
    const nextRange = sundayWeekRange(date);
    if (nextRange.start !== rangeStart) {
      const loaded = await fetchWeek(date);
      if (!loaded) return;
    } else if (dirtyDatesRef.current.size) {
      const saved = await queueSave(true);
      if (!saved) return;
    }
    setSelectedDate(date);
  }

  async function shiftVisible(direction: -1 | 1) {
    if (viewMode === "day") {
      await goToDate(shiftDateKey(selectedDate, direction));
      return;
    }
    const nextDate = shiftDateKey(selectedDate, direction * 7);
    const loaded = await fetchWeek(nextDate);
    if (loaded) setSelectedDate(nextDate);
  }

  function dateFromPointer(clientX: number) {
    const grid = timelineGridRef.current;
    if (!grid) return selectedDate;
    if (viewMode === "day") return selectedDate;
    const rect = grid.getBoundingClientRect();
    const width = rect.width / 7;
    const index = Math.max(0, Math.min(6, Math.floor((clientX - rect.left) / width)));
    return visibleDates[index] ?? selectedDate;
  }

  function mutateBlocks(updater: (current: CalendarBlock[]) => CalendarBlock[]) {
    setBlocks((current) => {
      const next = updater(current);
      blocksRef.current = next;
      return next;
    });
  }

  function updateBlock(clientId: string, updater: (block: CalendarBlock) => CalendarBlock) {
    mutateBlocks((current) => current.map((block) => (block.client_id === clientId ? updater(block) : block)));
  }

  function openEditor(block: CalendarBlock) {
    setEditingId(block.client_id);
    setEditorDraft({
      client_id: block.client_id,
      activity_date: block.activity_date,
      start_minute: block.start_minute,
      end_minute: block.end_minute,
      category_id: block.category_id,
      title: block.title ?? categoryMap.get(block.category_id)?.name ?? "",
      note: block.note ?? "",
    });
  }

  function closeEditor() {
    setEditingId(null);
    setEditorDraft(null);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function clearPendingMobileTouch() {
    clearLongPressTimer();
    pendingMobileTouchRef.current = null;
  }

  function addBlockAt(date = selectedDate, minute?: number) {
    if (!selectedCategory) return;
    const category = categoryMap.get(selectedCategory);
    const start = clampBlockStart(minute ?? Math.min(20 * 60, Math.max(0, snapMinute(currentMinute))), 60);
    const block: CalendarBlock = {
      client_id: makeClientId(),
      activity_date: date,
      start_minute: start,
      end_minute: start + 60,
      category_id: selectedCategory,
      title: category?.name ?? "Aktivitas",
      note: null,
      source: "manual",
    };
    if (!canPlace(block, blocksRef.current)) {
      setError("Waktu tersebut sudah memiliki dua aktivitas. Pilih waktu lain.");
      return;
    }
    mutateBlocks((current) => [...current, block]);
    markDatesDirty(date);
    openEditor(block);
  }

  function startCreate(event: ReactPointerEvent<HTMLDivElement>, date: string) {
    if (event.pointerType === "touch" || event.button !== 0 || !selectedCategory || !timelineGridRef.current) return;
    const minute = Math.min(1425, minutesFromPointer(event.clientY, timelineGridRef.current));
    const category = categoryMap.get(selectedCategory);
    const block: CalendarBlock = {
      client_id: makeClientId(),
      activity_date: date,
      start_minute: minute,
      end_minute: Math.min(1440, minute + 60),
      category_id: selectedCategory,
      title: category?.name ?? "Aktivitas",
      note: null,
      source: "manual",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: "create",
      pointerId: event.pointerId,
      blockId: block.client_id,
      anchorMinute: minute,
      original: block,
      moved: false,
    };
    mutateBlocks((current) => [...current, block]);
    setError(null);
  }

  function startMove(event: ReactPointerEvent<HTMLDivElement>, block: CalendarBlock) {
    if (event.button !== 0) return;
    event.stopPropagation();

    if (event.pointerType === "touch" && isMobileInput && armedBlockId !== block.client_id) {
      clearPendingMobileTouch();
      if (armedBlockId) setArmedBlockId(null);
      const pending: PendingMobileTouch = {
        pointerId: event.pointerId,
        blockId: block.client_id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        longPressed: false,
      };
      pendingMobileTouchRef.current = pending;
      longPressTimerRef.current = window.setTimeout(() => {
        const current = pendingMobileTouchRef.current;
        if (!current || current.pointerId !== event.pointerId || current.moved) return;
        current.longPressed = true;
        setArmedBlockId(block.client_id);
        setMessage("Move mode aktif. Lepas jari, lalu drag blok untuk memindahkan; tap area kosong untuk batal.");
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(15);
      }, MOBILE_HOLD_MS);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type: "move",
      pointerId: event.pointerId,
      blockId: block.client_id,
      original: { ...block },
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    setSelectedDate(block.activity_date);
    setError(null);
  }

  function startResize(
    event: ReactPointerEvent<HTMLDivElement>,
    block: CalendarBlock,
    type: "resize-start" | "resize-end",
  ) {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && isMobileInput && armedBlockId !== block.client_id) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      type,
      pointerId: event.pointerId,
      blockId: block.client_id,
      original: { ...block },
      moved: false,
    };
    setSelectedDate(block.activity_date);
    setError(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pendingTouch = pendingMobileTouchRef.current;
    if (!interactionRef.current && pendingTouch && event.pointerId === pendingTouch.pointerId) {
      const distance = Math.hypot(
        event.clientX - pendingTouch.startClientX,
        event.clientY - pendingTouch.startClientY,
      );
      if (distance > MOBILE_SCROLL_THRESHOLD) {
        pendingTouch.moved = true;
        clearLongPressTimer();
      }
      return;
    }

    const interaction = interactionRef.current;
    const grid = timelineGridRef.current;
    if (!interaction || !grid || event.pointerId !== interaction.pointerId) return;
    if (event.pointerType === "touch") event.preventDefault();

    if (interaction.type === "create") {
      const pointerMinute = minutesFromPointer(event.clientY, grid);
      interaction.moved = Math.abs(pointerMinute - interaction.anchorMinute) >= SNAP;
      if (!interaction.moved) return;

      const start = pointerMinute < interaction.anchorMinute ? pointerMinute : interaction.anchorMinute;
      const end = pointerMinute < interaction.anchorMinute
        ? interaction.anchorMinute
        : Math.max(interaction.anchorMinute + MIN_DURATION, pointerMinute);

      updateBlock(interaction.blockId, (block) => ({
        ...block,
        start_minute: Math.max(0, Math.min(1425, start)),
        end_minute: Math.max(MIN_DURATION, Math.min(1440, end)),
      }));
      return;
    }

    if (interaction.type === "move") {
      const duration = interaction.original.end_minute - interaction.original.start_minute;
      const deltaMinute = snapDelta((event.clientY - interaction.startClientY) / MINUTE_PX);
      const nextStart = clampBlockStart(interaction.original.start_minute + deltaMinute, duration);
      const nextDate = dateFromPointer(event.clientX);
      interaction.moved =
        interaction.moved ||
        Math.abs(event.clientX - interaction.startClientX) > 4 ||
        Math.abs(event.clientY - interaction.startClientY) > 4;
      updateBlock(interaction.blockId, (block) => ({
        ...block,
        activity_date: nextDate,
        start_minute: nextStart,
        end_minute: nextStart + duration,
      }));
      return;
    }

    const pointerMinute = minutesFromPointer(event.clientY, grid);
    interaction.moved = true;
    updateBlock(interaction.blockId, (block) => {
      if (interaction.type === "resize-start") {
        return {
          ...block,
          start_minute: Math.max(0, Math.min(block.end_minute - MIN_DURATION, pointerMinute)),
        };
      }
      return {
        ...block,
        end_minute: Math.min(1440, Math.max(block.start_minute + MIN_DURATION, pointerMinute)),
      };
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pendingTouch = pendingMobileTouchRef.current;
    if (!interactionRef.current && pendingTouch && event.pointerId === pendingTouch.pointerId) {
      clearLongPressTimer();
      pendingMobileTouchRef.current = null;
      if (!pendingTouch.moved && !pendingTouch.longPressed) {
        const block = blocksRef.current.find((item) => item.client_id === pendingTouch.blockId);
        if (block) openEditor(block);
      }
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    interactionRef.current = null;
    if (event.pointerType === "touch") setArmedBlockId(null);

    const current = blocksRef.current.find((block) => block.client_id === interaction.blockId);
    if (!current) return;

    if (!canPlace(current, blocksRef.current)) {
      if (interaction.type === "create") {
        mutateBlocks((items) => items.filter((block) => block.client_id !== interaction.blockId));
      } else {
        mutateBlocks((items) =>
          items.map((block) => (block.client_id === interaction.blockId ? interaction.original : block)),
        );
      }
      setError("Maksimal dua aktivitas boleh overlap pada waktu yang sama.");
      return;
    }

    if (interaction.type === "create") {
      markDatesDirty(current.activity_date);
      setSelectedDate(current.activity_date);
      openEditor(current);
      return;
    }

    if (interaction.type === "move") {
      if (!interaction.moved) {
        openEditor(current);
        return;
      }
      markDatesDirty(interaction.original.activity_date, current.activity_date);
      setSelectedDate(current.activity_date);
      return;
    }

    markDatesDirty(interaction.original.activity_date, current.activity_date);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const pendingTouch = pendingMobileTouchRef.current;
    if (pendingTouch && pendingTouch.pointerId === event.pointerId) {
      clearPendingMobileTouch();
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    if (interaction.type === "create") {
      mutateBlocks((items) => items.filter((block) => block.client_id !== interaction.blockId));
    } else {
      mutateBlocks((items) =>
        items.map((block) => (block.client_id === interaction.blockId ? interaction.original : block)),
      );
    }
    setArmedBlockId(null);
  }

  function handleMobileDayTap(event: ReactMouseEvent<HTMLDivElement>, date: string) {
    if (!isMobileInput || event.target !== event.currentTarget) return;
    if (armedBlockId) {
      setArmedBlockId(null);
      setMessage(null);
      return;
    }
    if (!timelineGridRef.current) return;
    const minute = Math.min(1425, minutesFromPointer(event.clientY, timelineGridRef.current));
    addBlockAt(date, minute);
  }

  function saveEditor() {
    if (!editorDraft) return;
    const original = blocksRef.current.find((block) => block.client_id === editorDraft.client_id);
    if (!original) return;

    const category = categoryMap.get(editorDraft.category_id);
    const candidate: CalendarBlock = {
      ...original,
      activity_date: editorDraft.activity_date,
      start_minute: editorDraft.start_minute,
      end_minute: editorDraft.end_minute,
      category_id: editorDraft.category_id,
      title: editorDraft.title.trim() || category?.name || "Aktivitas",
      note: editorDraft.note.trim() || null,
    };

    if (candidate.end_minute <= candidate.start_minute) {
      setError("Jam selesai harus setelah jam mulai.");
      return;
    }
    if (!canPlace(candidate, blocksRef.current)) {
      setError("Perubahan ini membuat lebih dari dua aktivitas overlap.");
      return;
    }

    mutateBlocks((items) => items.map((block) => (block.client_id === candidate.client_id ? candidate : block)));
    markDatesDirty(original.activity_date, candidate.activity_date);
    setSelectedDate(candidate.activity_date);
    closeEditor();
  }

  function deleteEditorBlock() {
    if (!editorDraft) return;
    const original = blocksRef.current.find((block) => block.client_id === editorDraft.client_id);
    if (!original) return;
    mutateBlocks((items) => items.filter((block) => block.client_id !== editorDraft.client_id));
    markDatesDirty(original.activity_date);
    closeEditor();
  }

  function duplicateEditorBlock() {
    if (!editorDraft) return;
    const original = blocksRef.current.find((block) => block.client_id === editorDraft.client_id);
    if (!original) return;
    const duration = original.end_minute - original.start_minute;
    const start = clampBlockStart(original.end_minute, duration);
    const copy: CalendarBlock = {
      ...original,
      client_id: makeClientId(),
      id: undefined,
      start_minute: start,
      end_minute: start + duration,
      title: original.title ? `${original.title} copy` : categoryMap.get(original.category_id)?.name ?? "Aktivitas",
    };
    if (!canPlace(copy, blocksRef.current)) {
      setError("Tidak ada ruang untuk duplicate block setelah aktivitas ini.");
      return;
    }
    mutateBlocks((items) => [...items, copy]);
    markDatesDirty(copy.activity_date);
    openEditor(copy);
  }

  const headerLabel =
    viewMode === "week"
      ? `${formatCompactDate(rangeStart)} – ${formatCompactDate(rangeEnd)}`
      : formatDateKey(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel}>
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void shiftVisible(-1)}
              disabled={loading || busy}
              className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50"
              aria-label={viewMode === "week" ? "Previous week" : "Previous day"}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void goToDate(initialDate)}
              disabled={loading || busy}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => void shiftVisible(1)}
              disabled={loading || busy}
              className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-50"
              aria-label={viewMode === "week" ? "Next week" : "Next day"}
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="min-w-0 px-1 text-sm font-semibold sm:text-base">{headerLabel}</div>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => void goToDate(event.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
              aria-label="Jump to date"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setView("week")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "week" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <CalendarDays className="size-3.5" /> Week
              </button>
              <button
                type="button"
                onClick={() => setView("day")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "day" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <Clock3 className="size-3.5" /> Day
              </button>
            </div>

            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading</span>
            ) : busy ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"><Loader2 className="size-3 animate-spin" /> Saving</span>
            ) : dirtyDates.size ? (
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved</span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">Saved</span>
            )}

            <button
              type="button"
              onClick={() => void queueSave(false)}
              disabled={loading || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save now
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {activeCategories.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selectedCategory === category.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
              {category.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => addBlockAt()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="size-3.5" /> New block
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground md:hidden">
          <span className="font-semibold text-foreground">HP:</span> scroll Timeline seperti biasa. Tap blok untuk edit. Hold sekitar 0,4 detik sampai move mode aktif, lepas jari, lalu drag blok. Tap area kosong untuk membuat aktivitas baru.
        </div>
      </div>

      {error ? <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {message ? <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" /> {message}</div> : null}

      <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div
          ref={scrollRef}
          className="max-h-[74vh] overflow-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
        >
          <div className={viewMode === "week" ? "min-w-[980px]" : "min-w-0"}>
            <div
              className="sticky top-0 z-40 grid border-b border-border bg-card/95 backdrop-blur"
              style={{ gridTemplateColumns: `64px repeat(${visibleDates.length}, minmax(0, 1fr))` }}
            >
              <div className="border-r border-border px-2 py-3 text-center font-mono text-[10px] text-muted-foreground">WITA</div>
              {visibleDates.map((date) => {
                const active = date === selectedDate;
                const today = date === todayKey;
                return (
                  <button
                    type="button"
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`border-r border-border px-2 py-2 text-center transition-colors last:border-r-0 ${active ? "bg-primary/5" : "hover:bg-muted/60"}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {formatDateKey(date, { weekday: "short" })}
                    </div>
                    <div className={`mx-auto mt-1 grid size-9 place-items-center rounded-full text-lg font-medium ${today ? "bg-primary text-primary-foreground" : ""}`}>
                      {Number(date.slice(-2))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid" style={{ gridTemplateColumns: "64px minmax(0, 1fr)" }}>
              <div className="relative border-r border-border bg-card" style={{ height: DAY_HEIGHT }}>
                {Array.from({ length: 24 }, (_, hour) => (
                  <div
                    key={hour}
                    className="absolute right-2 -translate-y-1/2 font-mono text-[10px] tabular-nums text-muted-foreground"
                    style={{ top: hour * HOUR_HEIGHT }}
                  >
                    {minuteLabel(hour * 60)}
                  </div>
                ))}
              </div>

              <div
                ref={timelineGridRef}
                className="relative grid bg-card"
                style={{
                  height: DAY_HEIGHT,
                  gridTemplateColumns: `repeat(${visibleDates.length}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: 25 }, (_, hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/80"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}
                {Array.from({ length: 96 }, (_, slot) => (
                  <div
                    key={`minor-${slot}`}
                    className={`pointer-events-none absolute inset-x-0 border-t ${slot % 4 === 0 ? "border-transparent" : "border-border/20"}`}
                    style={{ top: slot * SNAP * MINUTE_PX }}
                  />
                ))}

                {visibleDates.map((date) => {
                  const dayBlocks = visibleBlocks.filter((block) => block.activity_date === date);
                  const layout = dayLayout(dayBlocks);
                  return (
                    <div
                      key={date}
                      data-day={date}
                      onPointerDown={(event) => startCreate(event, date)}
                      onClick={(event) => handleMobileDayTap(event, date)}
                      className={`relative border-r border-border/80 last:border-r-0 ${selectedDate === date ? "bg-primary/[0.015]" : ""}`}
                      style={{ height: DAY_HEIGHT, touchAction: isMobileInput ? "pan-x pan-y" : "auto" }}
                    >
                      {date === todayKey ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                          style={{ top: currentMinute * MINUTE_PX }}
                        >
                          <span className="-ml-1 size-2.5 rounded-full bg-rose-500" />
                          <span className="h-px flex-1 bg-rose-500" />
                        </div>
                      ) : null}

                      {dayBlocks.map((block) => {
                        const category = categoryMap.get(block.category_id);
                        const position = layout.get(block.client_id) ?? { lane: 0, split: false };
                        const height = Math.max(18, (block.end_minute - block.start_minute) * MINUTE_PX - 2);
                        const left = position.split ? `calc(${position.lane * 50}% + 3px)` : "3px";
                        const width = position.split ? "calc(50% - 6px)" : "calc(100% - 6px)";
                        const color = category?.color ?? "#64748b";
                        const foreground = textColor(color);
                        const armed = armedBlockId === block.client_id;
                        return (
                          <div
                            key={block.client_id}
                            onPointerDown={(event) => startMove(event, block)}
                            onClick={(event) => event.stopPropagation()}
                            className={`group absolute overflow-hidden rounded-md border border-black/10 px-2 py-1 shadow-sm transition-[box-shadow,transform] hover:z-30 hover:shadow-md dark:border-white/10 ${armed ? "z-40 ring-2 ring-white/90 ring-offset-2 ring-offset-background" : "z-20"}`}
                            style={{
                              top: block.start_minute * MINUTE_PX + 1,
                              height,
                              left,
                              width,
                              backgroundColor: color,
                              color: foreground,
                              touchAction: isMobileInput ? (armed ? "none" : "pan-x pan-y") : "none",
                              cursor: armed ? "grabbing" : "grab",
                            }}
                            title={`${block.title || category?.name || "Aktivitas"} · ${minuteLabel(block.start_minute)}–${minuteLabel(block.end_minute)}`}
                          >
                            {armed ? (
                              <div className="pointer-events-none absolute right-1 top-1 rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                move
                              </div>
                            ) : null}
                            <div
                              onPointerDown={(event) => startResize(event, block, "resize-start")}
                              className={`absolute inset-x-1 top-0 h-2.5 cursor-ns-resize rounded-full transition-opacity sm:h-1.5 ${armed ? "opacity-80" : "opacity-0 group-hover:opacity-80"}`}
                              style={{ backgroundColor: foreground }}
                            />
                            <div className="truncate text-[11px] font-semibold leading-4 sm:text-xs">
                              {block.title || category?.name || "Aktivitas"}
                            </div>
                            {height >= 34 ? (
                              <div className="truncate text-[10px] leading-3 opacity-90">
                                {minuteLabel(block.start_minute)} – {minuteLabel(block.end_minute)}
                              </div>
                            ) : null}
                            {height >= 54 ? (
                              <div className="mt-0.5 truncate text-[10px] leading-3 opacity-80">{category?.name}</div>
                            ) : null}
                            {height >= 74 && block.note ? (
                              <div className="mt-1 line-clamp-2 text-[10px] leading-3 opacity-75">{block.note}</div>
                            ) : null}
                            <div
                              onPointerDown={(event) => startResize(event, block, "resize-end")}
                              className={`absolute inset-x-1 bottom-0 h-2.5 cursor-ns-resize rounded-full transition-opacity sm:h-1.5 ${armed ? "opacity-80" : "opacity-0 group-hover:opacity-80"}`}
                              style={{ backgroundColor: foreground }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Selected day</p>
          <p className="mt-1 text-sm font-semibold">{formatCompactDate(selectedDate)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Coverage</p>
          <p className="mt-1 font-mono text-sm font-semibold">{formatDuration(selectedCoverage)} · {Math.round((selectedCoverage / 1440) * 100)}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2">
          <p className="text-xs font-medium text-muted-foreground">Activity time</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {Array.from(dayTotals.entries()).length ? Array.from(dayTotals.entries()).sort((a, b) => b[1] - a[1]).map(([categoryId, minutes]) => {
              const category = categoryMap.get(categoryId);
              if (!category) return null;
              return <span key={categoryId} className="inline-flex items-center gap-1.5 text-xs"><span className="size-2 rounded-full" style={{ backgroundColor: category.color }} />{category.name}<span className="font-mono text-muted-foreground">{formatDuration(minutes)}</span></span>;
            }) : <span className="text-xs text-muted-foreground">Belum ada aktivitas.</span>}
          </div>
        </div>
      </div>

      {editingId && editorDraft ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}>
          <div className="w-full max-w-lg rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="font-semibold">Edit activity</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">15-minute precision · drag the calendar block to move it.</p>
              </div>
              <button type="button" onClick={closeEditor} className="grid size-9 place-items-center rounded-lg hover:bg-muted" aria-label="Close editor"><X className="size-4" /></button>
            </div>

            <div className="space-y-4 p-4">
              <label className="block text-xs font-medium">
                Title
                <input
                  value={editorDraft.title}
                  onChange={(event) => setEditorDraft({ ...editorDraft, title: event.target.value })}
                  maxLength={120}
                  placeholder="Contoh: JLPT N2 Dokkai"
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </label>

              <label className="block text-xs font-medium">
                Category
                <select
                  value={editorDraft.category_id}
                  onChange={(event) => setEditorDraft({ ...editorDraft, category_id: event.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium">
                  Date
                  <input
                    type="date"
                    value={editorDraft.activity_date}
                    onChange={(event) => setEditorDraft({ ...editorDraft, activity_date: event.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-medium">
                  Start
                  <input
                    type="time"
                    step={900}
                    value={minuteToInput(editorDraft.start_minute)}
                    onChange={(event) => setEditorDraft({ ...editorDraft, start_minute: inputToMinute(event.target.value) })}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-medium">
                  End
                  <input
                    type="time"
                    step={900}
                    value={minuteToInput(Math.min(1439, editorDraft.end_minute))}
                    onChange={(event) => {
                      const raw = inputToMinute(event.target.value);
                      setEditorDraft({ ...editorDraft, end_minute: raw <= editorDraft.start_minute ? editorDraft.start_minute + SNAP : raw });
                    }}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium">
                Note
                <textarea
                  value={editorDraft.note}
                  onChange={(event) => setEditorDraft({ ...editorDraft, note: event.target.value })}
                  rows={4}
                  maxLength={500}
                  placeholder="Catatan opsional…"
                  className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
              <button type="button" onClick={deleteEditorBlock} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-500/10"><Trash2 className="size-4" /> Delete</button>
              <button type="button" onClick={duplicateEditorBlock} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">Duplicate</button>
              <div className="flex-1" />
              <button type="button" onClick={closeEditor} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button type="button" onClick={saveEditor} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Save className="size-4" /> Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
