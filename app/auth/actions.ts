"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeNext(formData.get("next"));

  if (!email || !password) {
    redirect(createLoginUrl({ message: "Enter an email and password", next }));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(createLoginUrl({ message: error.message, next }));
  }

  await prisma.user.updateMany({
    where: { email },
    data: { status: "ONLINE", previousStatus: null },
  });

  redirect(next);
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const next = getSafeNext(formData.get("next"));

  if (!email || !password) {
    redirect(createLoginUrl({ message: "Enter an email and password", mode: "signup", next }));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        first_name: firstName,
        last_name: lastName,
        display_name: displayName || [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
        full_name: [firstName, lastName].filter(Boolean).join(" ") || displayName || email.split("@")[0],
      },
    },
  });

  if (error) {
    redirect(createLoginUrl({ message: error.message, mode: "signup", next }));
  }

  redirect(createLoginUrl({ message: "Check your email to confirm your account", next }));
}

export async function signInWithOAuth(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  const next = getSafeNext(formData.get("next"));

  if (provider !== "google") {
    redirect(createLoginUrl({ message: "Unknown provider", next }));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    redirect(createLoginUrl({ message: error?.message ?? "Could not start sign in", next }));
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function getSiteUrl() {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function getSafeNext(value: FormDataEntryValue | string | null | undefined) {
  const next = String(value ?? "/");

  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

function createLoginUrl({
  message,
  mode,
  next,
}: {
  message: string;
  mode?: "signup";
  next: string;
}) {
  const params = new URLSearchParams({
    message,
  });

  if (mode) {
    params.set("mode", mode);
  }

  if (next !== "/") {
    params.set("next", next);
  }

  return `/login?${params.toString()}`;
}
