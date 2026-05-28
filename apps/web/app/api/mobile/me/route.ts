import { NextResponse } from "next/server";
import type { MobileMeResponse } from "@scribbl/shared";
import { getAuthProfile } from "@/lib/current-user";
import { getCurrentMobileAuthIdentity, getCurrentMobileUserFromIdentity } from "@/lib/mobile-auth";
import { mobileUnauthorized } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authUser = await getCurrentMobileAuthIdentity(request);
  if (!authUser) return mobileUnauthorized();

  const user = await getCurrentMobileUserFromIdentity(authUser, { tolerateDatabaseFailure: true });
  const response: MobileMeResponse = { user: user ? serializeDbUser(user) : serializeAuthUser(authUser) };

  return NextResponse.json(response);
}

function serializeDbUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  institution: string | null;
  jobTitle: string | null;
  bio: string | null;
}): MobileMeResponse["user"] {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    institution: user.institution,
    jobTitle: user.jobTitle,
    bio: user.bio,
  };
}

function serializeAuthUser(authUser: {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}): MobileMeResponse["user"] {
  const email = authUser.email.toLowerCase();
  const profile = getAuthProfile(authUser.user_metadata, email);

  return {
    id: authUser.id,
    email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName: profile.displayName,
    avatarUrl: typeof authUser.user_metadata.avatar_url === "string" ? authUser.user_metadata.avatar_url : null,
    institution: null,
    jobTitle: null,
    bio: null,
  };
}
