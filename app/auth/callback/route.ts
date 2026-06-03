import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

function getOrigin(request: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNext(requestUrl.searchParams.get("next"));
  const origin = getOrigin(request);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(createLoginUrl("Could not finish sign in. Try again.", next), origin),
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      await prisma.user.updateMany({
        where: { email: user.email.toLowerCase() },
        data: { status: "ONLINE", previousStatus: null },
      });
    }
  } else {
    return NextResponse.redirect(new URL(createLoginUrl("Could not finish sign in. Try again.", next), origin));
  }

  return NextResponse.redirect(new URL(next, origin));
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
