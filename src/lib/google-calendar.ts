import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

type StoredGoogleTokens = {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string | null;
  google_account: string | null;
  updated_at: string;
};

export function isGoogleCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      isAdminConfigured(),
  );
}

export function googleRedirectUri(origin: string) {
  return `${origin}/api/google/calendar/callback`;
}

export async function getStoredGoogleTokens(userId: string) {
  if (!isAdminConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_get_google_calendar_tokens", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] ?? null) as StoredGoogleTokens | null;
}

export async function saveGoogleTokens(params: {
  userId: string;
  refreshToken: string;
  accessToken?: string | null;
  expiresIn?: number | null;
  scopes?: string | null;
  googleAccount?: string | null;
}) {
  const admin = createAdminClient();
  const expiresAt = params.expiresIn
    ? new Date(Date.now() + params.expiresIn * 1000).toISOString()
    : null;
  const { error } = await admin.rpc("admin_set_google_calendar_tokens", {
    p_user_id: params.userId,
    p_refresh_token: params.refreshToken,
    p_access_token: params.accessToken ?? null,
    p_access_token_expires_at: expiresAt,
    p_scopes: params.scopes ?? null,
    p_google_account: params.googleAccount ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteGoogleTokens(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_google_calendar_tokens", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

async function refreshGoogleAccessToken(userId: string, refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured.");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Failed to refresh Google access token.");
  }

  await saveGoogleTokens({
    userId,
    refreshToken,
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
    scopes: json.scope ?? null,
  });
  return json.access_token;
}

export async function getGoogleAccessToken(userId: string) {
  if (!isGoogleCalendarConfigured()) throw new Error("Google Calendar is not configured.");
  const stored = await getStoredGoogleTokens(userId);
  if (!stored?.refresh_token) throw new Error("Google Calendar is not connected.");

  if (stored.access_token && stored.access_token_expires_at) {
    const expiresAt = new Date(stored.access_token_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
      return stored.access_token;
    }
  }
  return refreshGoogleAccessToken(userId, stored.refresh_token);
}

export async function googleApiFetch<T>(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let accessToken = await getGoogleAccessToken(userId);
  let response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    const stored = await getStoredGoogleTokens(userId);
    if (!stored?.refresh_token) throw new Error("Google Calendar connection expired.");
    accessToken = await refreshGoogleAccessToken(userId, stored.refresh_token);
    response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  }

  const text = await response.text();
  const json = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T);
  if (!response.ok) {
    const message = (json as { error?: { message?: string } }).error?.message;
    throw new Error(message || `Google Calendar API returned ${response.status}.`);
  }
  return json as T;
}

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
};

export async function listGoogleCalendars(userId: string) {
  const calendars: GoogleCalendarListItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      maxResults: "250",
      showHidden: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleApiFetch<{
      items?: GoogleCalendarListItem[];
      nextPageToken?: string;
    }>(userId, `/users/me/calendarList?${params.toString()}`);
    calendars.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return calendars;
}

export function calendarEventFingerprint(parts: {
  date: string;
  startMinute: number;
  endMinute: number;
  categoryId: string;
  note?: string | null;
}) {
  return createHash("sha256")
    .update(
      [parts.date, parts.startMinute, parts.endMinute, parts.categoryId, parts.note ?? ""].join("|"),
    )
    .digest("hex")
    .slice(0, 40);
}

export function localDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = localDateTimeParts(date, timeZone);
  const [year, month, day] = parts.dateKey.split("-").map(Number);
  const asUtc = Date.UTC(year, month - 1, day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function zonedLocalToIso(dateKey: string, minuteOfDay: number, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(naiveUtc);
  let offset = timeZoneOffsetMs(candidate, timeZone);
  candidate = new Date(naiveUtc - offset);
  const secondOffset = timeZoneOffsetMs(candidate, timeZone);
  if (secondOffset !== offset) candidate = new Date(naiveUtc - secondOffset);
  return candidate.toISOString();
}
