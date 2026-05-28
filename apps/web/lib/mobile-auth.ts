import "server-only";

import { createClient } from "@supabase/supabase-js";
import { syncCurrentUserFromAuthIdentity, type SupabaseAuthIdentity } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

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
    return await syncCurrentUserFromAuthIdentity(authUser);
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

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const [scheme, token] = header?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}
