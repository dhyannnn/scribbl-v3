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
      const updateData = getChangedProfileData(existingUser, data);

      if (Object.keys(updateData).length === 0) {
        return existingUser;
      }

      return prisma.user.update({
        where: {
          id: existingUser.id,
        },
        data: updateData,
      });
    }

    return prisma.user.create({
      data: {
        ...data,
        notificationPreference: {
          create: {},
        },
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
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub || !data.claims.email) {
    return null;
  }

  return {
    id: data.claims.sub,
    email: data.claims.email,
    user_metadata: data.claims.user_metadata ?? {},
  };
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

function getChangedProfileData(
  current: {
    authUserId: string | null;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    avatarUrl: string | null;
  },
  next: {
    authUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    avatarUrl?: string;
  },
) {
  const data: Partial<typeof next> = {};

  if (current.authUserId !== next.authUserId) {
    data.authUserId = next.authUserId;
  }
  if (current.email !== next.email) {
    data.email = next.email;
  }
  // Name fields are only synced from auth on first login (account creation).
  // After that they're owned by the user via the account page — never overwrite
  // from a potentially stale JWT, which would silently undo explicit user saves.
  if (!current.firstName && current.firstName !== next.firstName) {
    data.firstName = next.firstName;
  }
  if (!current.lastName && current.lastName !== next.lastName) {
    data.lastName = next.lastName;
  }
  if (!current.displayName && current.displayName !== next.displayName) {
    data.displayName = next.displayName;
  }
  if (next.avatarUrl !== undefined && current.avatarUrl !== next.avatarUrl) {
    data.avatarUrl = next.avatarUrl;
  }

  return data;
}
