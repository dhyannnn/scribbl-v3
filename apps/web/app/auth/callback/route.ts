import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNext(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(createLoginUrl("Could not finish sign in. Try again.", next), requestUrl.origin),
      );
    }
  } else {
    return NextResponse.redirect(new URL(createLoginUrl("Could not finish sign in. Try again.", next), requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function createLoginUrl(message: string, next: string) {
  const params = new URLSearchParams({
    message,
  });

  if (next !== "/") {
    params.set("next", next);
  }

  return `/login?${params.toString()}`;
}
