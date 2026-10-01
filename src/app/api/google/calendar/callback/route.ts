import { NextRequest, NextResponse } from "next/server";
import {
  getStoredGoogleTokens,
  googleRedirectUri,
  isGoogleCalendarConfigured,
  saveGoogleTokens,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const settingsUrl = new URL("/settings", request.url);
  const errorParam = request.nextUrl.searchParams.get("error");
  if (errorParam) {
    settingsUrl.searchParams.set("calendar", "denied");
    return NextResponse.redirect(settingsUrl);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("focus_google_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("calendar", "invalid-state");
    return NextResponse.redirect(settingsUrl);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/auth/login", request.url));
  if (!isGoogleCalendarConfigured()) {
    settingsUrl.searchParams.set("calendar", "not-configured");
    return NextResponse.redirect(settingsUrl);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(request.nextUrl.origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokenJson = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenJson.access_token) {
    settingsUrl.searchParams.set("calendar", "token-error");
    return NextResponse.redirect(settingsUrl);
  }

  const existing = await getStoredGoogleTokens(data.user.id);
  const refreshToken = tokenJson.refresh_token || existing?.refresh_token;
  if (!refreshToken) {
    settingsUrl.searchParams.set("calendar", "missing-refresh-token");
    return NextResponse.redirect(settingsUrl);
  }

  let googleAccount: string | null = null;
  try {
    const primary = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
      cache: "no-store",
    });
    if (primary.ok) {
      const calendar = (await primary.json()) as { id?: string };
      googleAccount = calendar.id ?? null;
    }
  } catch {
    // Account label is optional; connection can still succeed.
  }

  await saveGoogleTokens({
    userId: data.user.id,
    refreshToken,
    accessToken: tokenJson.access_token,
    expiresIn: tokenJson.expires_in ?? 3600,
    scopes: tokenJson.scope ?? null,
    googleAccount,
  });

  settingsUrl.searchParams.set("calendar", "connected");
  const response = NextResponse.redirect(settingsUrl);
  response.cookies.delete("focus_google_oauth_state");
  return response;
}
