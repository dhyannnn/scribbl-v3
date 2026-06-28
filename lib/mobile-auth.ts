import "server-only";

import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

type SupabaseAuthIdentity = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
};

export async function getCurrentMobileUser(request: Request) {
  const authUser = await getCurrentMobileAuthIdentity(request);

  if (!authUser) {
    return null;
  }

  return getCurrentMobileUserFromIdentity(authUser);
}

export async function getCurrentMobileUserFromIdentity(
  authUser: SupabaseAuthIdentity,
  options: { tolerateDatabaseFailure?: boolean } = {},
) {
  try {
    return await syncMobileUserFromAuthIdentity(authUser);
  } catch (error) {
    console.error("Failed to sync mobile auth user", error);
  }

  try {
    return await findExistingMobileUser(authUser);
  } catch (error) {
    console.error("Failed to load existing mobile auth user", error);
    if (!options.tolerateDatabaseFailure) {
      throw error;
    }
    return null;
  }
}

export async function getCurrentMobileAuthIdentity(request: Request): Promise<SupabaseAuthIdentity | null> {
  const token = getBearerToken(request);

  if (!token || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user?.email) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email,
    user_metadata: data.user.user_metadata ?? {},
  };
}

async function findExistingMobileUser(authUser: SupabaseAuthIdentity) {
  const email = authUser.email.toLowerCase();

  return prisma.user.findFirst({
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
}

async function syncMobileUserFromAuthIdentity(authUser: SupabaseAuthIdentity) {
  const email = authUser.email.toLowerCase();
  const profile = getAuthProfile(authUser.user_metadata, email);
  const existingUser = await findExistingMobileUser(authUser);
  const data = {
    authUserId: authUser.id,
    email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    avatarUrl: typeof authUser.user_metadata.avatar_url === "string" ? authUser.user_metadata.avatar_url : undefined,
  };

  if (existingUser) {
    const updateData = getChangedProfileData(existingUser, data);

    if (Object.keys(updateData).length === 0) {
      return existingUser;
    }

    return prisma.user.update({
      where: { id: existingUser.id },
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

export function getAuthProfile(metadata: Record<string, unknown>, email: string) {
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

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const [scheme, token] = header?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}
