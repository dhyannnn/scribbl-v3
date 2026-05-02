import "server-only";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const authUser = await getSupabaseAuthUser();

  if (authUser?.email) {
    const displayName =
      typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : typeof authUser.user_metadata?.name === "string"
          ? authUser.user_metadata.name
          : authUser.email.split("@")[0];

    return prisma.user.upsert({
      where: {
        email: authUser.email.toLowerCase(),
      },
      update: {
        displayName,
        avatarUrl:
          typeof authUser.user_metadata?.avatar_url === "string" ? authUser.user_metadata.avatar_url : undefined,
      },
      create: {
        email: authUser.email.toLowerCase(),
        displayName,
        avatarUrl:
          typeof authUser.user_metadata?.avatar_url === "string" ? authUser.user_metadata.avatar_url : undefined,
      },
    });
  }

  return null;
}

export async function getSupabaseAuthUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
