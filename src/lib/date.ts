export function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(`${dateKey}T12:00:00Z`));
}


export function sundayWeekRange(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  return {
    start: shiftDateKey(dateKey, -day),
    end: shiftDateKey(dateKey, 6 - day),
  };
}

export function weekRange(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  const fromMonday = day === 0 ? 6 : day - 1;
  return {
    start: shiftDateKey(dateKey, -fromMonday),
    end: shiftDateKey(dateKey, 6 - fromMonday),
  };
}

export function monthRange(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1, 12));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}
