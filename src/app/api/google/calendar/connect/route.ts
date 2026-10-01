import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_CALENDAR_SCOPES,
  googleRedirectUri,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/auth/login", request.url));
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(new URL("/settings?calendar=not-configured", request.url));
  }

  const state = randomUUID();
  const redirectUri = googleRedirectUri(request.nextUrl.origin);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
  response.cookies.set("focus_google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
