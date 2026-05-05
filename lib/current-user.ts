import "server-only";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const authUser = await getSupabaseAuthUser();

  if (authUser?.email) {
    const email = authUser.email.toLowerCase();
    const profile = getAuthProfile(authUser.user_metadata, email);
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          {
            authUserId: authUser.id,
          },
          {
            email,
          },
        ],
      },
    });

    const data = {
      authUserId: authUser.id,
      email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      displayName: profile.displayName,
      avatarUrl:
        typeof authUser.user_metadata?.avatar_url === "string" ? authUser.user_metadata.avatar_url : undefined,
    };

    if (existingUser) {
      return prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data,
      });
    }

    return prisma.user.create({
      data,
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

function getAuthProfile(metadata: Record<string, unknown>, email: string) {
  const firstName = stringValue(metadata.first_name);
  const lastName = stringValue(metadata.last_name);
  const metadataDisplayName = stringValue(metadata.display_name);
  const fullName = stringValue(metadata.full_name) || stringValue(metadata.name);
  const fallbackName = email.split("@")[0];
  const displayName = metadataDisplayName || fullName || [firstName, lastName].filter(Boolean).join(" ") || fallbackName;

  if (firstName || lastName) {
    return {
      firstName,
      lastName,
      displayName,
    };
  }

  const parsedName = parseName(fullName || displayName);

  return {
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    displayName,
  };
}

function parseName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
