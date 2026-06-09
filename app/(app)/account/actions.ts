"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentUser, getSupabaseAuthUser } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { RateLimits } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AvatarUploadResult = {
  avatarUrl?: string;
  error?: "unauthenticated" | "invalid" | "too-large" | "upload-failed";
};

const maxAvatarSizeBytes = 5 * 1024 * 1024;

export async function updateAccountProfile(formData: FormData) {
  const currentUser = await getCurrentUser();
  const authUser = await getSupabaseAuthUser();

  if (!currentUser || !authUser) {
    redirect("/login?next=/account");
  }

  // Accept either separate first/last or a combined "fullName" field
  const fullName = String(formData.get("fullName") ?? "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts.length > 0
    ? parts[0]
    : String(formData.get("firstName") ?? "").trim();
  const lastName = parts.length > 1
    ? parts.slice(1).join(" ")
    : String(formData.get("lastName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? fullName).trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const linkedinUrl = sanitizeSocialUrl(formData.get("linkedinUrl"));
  const githubUrl = sanitizeSocialUrl(formData.get("githubUrl"));
  const websiteUrl = sanitizeSocialUrl(formData.get("websiteUrl"));
  const twitterUrl = sanitizeSocialUrl(formData.get("twitterUrl"));
  const timezone = String(formData.get("timezone") ?? "UTC").trim() || "UTC";
  const language = String(formData.get("language") ?? "en").trim() || "en";
  const resolvedDisplayName = displayName || [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];

  if (!firstName || !email) {
    redirect("/account?message=Enter your name and email address");
  }

  const supabase = await createClient();
  const authUpdate =
    email !== authUser.email?.toLowerCase()
      ? {
          email,
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: resolvedDisplayName,
            full_name: [firstName, lastName].filter(Boolean).join(" "),
          },
        }
      : {
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: resolvedDisplayName,
            full_name: [firstName, lastName].filter(Boolean).join(" "),
          },
        };

  const { data, error } = await supabase.auth.updateUser(authUpdate);

  if (error) {
    redirect(`/account?message=${encodeURIComponent(error.message)}`);
  }

  const confirmedEmail = data.user.email?.toLowerCase();
  await prisma.user.update({
    where: {
      id: currentUser.id,
    },
    data: {
      firstName,
      lastName,
      displayName: resolvedDisplayName,
      email: confirmedEmail === email ? email : currentUser.email,
      institution,
      jobTitle,
      bio,
      linkedinUrl,
      githubUrl,
      websiteUrl,
      twitterUrl,
      timezone,
      language,
    },
  });

  const message =
    confirmedEmail === email
      ? "Account updated"
      : "Profile updated. Check your email to confirm the new address.";

  revalidatePath("/account");
  redirect(`/account?message=${encodeURIComponent(message)}`);
}

export async function uploadAvatar(formData: FormData): Promise<AvatarUploadResult> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { error: "unauthenticated" };
  }

  const file = formData.get("avatar");

  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { error: "invalid" };
  }

  if (file.size > maxAvatarSizeBytes) {
    return { error: "too-large" };
  }

  const ext = getAvatarExtension(file.type);

  if (!ext) {
    return { error: "invalid" };
  }

  try {
    const supabase = createAdminClient();
    const path = `${currentUser.id}.${ext}`;
    const bytes = await file.arrayBuffer();
    const { error } = await supabase.storage.from("avatars").upload(path, bytes, {
      contentType: file.type,
      upsert: true,
    });

    if (error) {
      logger.supabaseStorageError({ userId: currentUser.id, bucket: "avatars", path }, new Error(error.message));
      return { error: "upload-failed" };
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

    await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        avatarUrl,
      },
    });

    revalidatePath("/account");
    return { avatarUrl };
  } catch (error) {
    logger.supabaseStorageError({ userId: currentUser.id, bucket: "avatars" }, error);
    return { error: "upload-failed" };
  }
}

export async function updateAccountPassword(formData: FormData) {
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect("/login?next=/account");
  }

  if (!await RateLimits.passwordUpdate(authUser.id)) {
    redirect("/account?message=Too many password update attempts. Try again later.");
  }

  const password = String(formData.get("password") ?? "");

  if (password.length < 6) {
    redirect("/account?message=Enter a password with at least 6 characters");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    redirect(`/account?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/account?message=Password updated");
}

export async function deleteAccount(formData: FormData) {
  const [currentUser, authUser] = await Promise.all([getCurrentUser(), getSupabaseAuthUser()]);

  if (!currentUser || !authUser) {
    redirect("/login");
  }

  if (!await RateLimits.accountDelete(currentUser.id)) {
    redirect("/account?message=Too many deletion attempts. Try again later.");
  }

  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (confirmation !== "DELETE") {
    redirect("/account?message=Type DELETE to confirm account deletion");
  }

  const ownedWorkspace = await prisma.workspaceMember.findFirst({
    where: {
      userId: currentUser.id,
      role: "OWNER",
      status: "ACTIVE",
    },
    include: {
      workspace: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (ownedWorkspace) {
    redirect(
      `/account?message=${encodeURIComponent(
        `You own ${ownedWorkspace.workspace.name}. Account deletion is blocked until ownership is transferred.`,
      )}`,
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    redirect("/account?message=Account deletion requires Supabase admin credentials");
  }

  const deletionRequestedAt = new Date();

  await prisma.user.update({
    where: {
      id: currentUser.id,
    },
    data: {
      deletionRequestedAt,
    },
  });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(authUser.id);

  if (error) {
    logger.accountDeletionError({ userId: currentUser.id }, new Error(error.message));
    await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        deletionRequestedAt: null,
      },
    });
    redirect(`/account?message=${encodeURIComponent(error.message)}`);
  }

  const deletedAt = new Date();

  await prisma.$transaction([
    prisma.workspaceMember.updateMany({
      where: {
        userId: currentUser.id,
        status: "ACTIVE",
      },
      data: {
        status: "REMOVED",
      },
    }),
    prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        authUserId: null,
        email: `deleted-user-${currentUser.id}@deleted.scribbl.local`,
        firstName: "",
        lastName: "",
        displayName: "Deleted user",
        avatarUrl: null,
        deletionRequestedAt,
        deletedAt,
      },
    }),
  ]);

  await writeAuditLog({
    action: "ACCOUNT_DELETED",
    actorUserId: currentUser.id,
    targetId: currentUser.id,
    metadata: { email: currentUser.email },
  });

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login?message=Account deleted");
}

export async function signOutAllDevices() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?message=Signed out of all devices");
}

export async function updateDarkMode(enabled: boolean) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;
  await prisma.user.update({
    where: { id: currentUser.id },
    data: { darkMode: enabled },
  });
}

function sanitizeSocialUrl(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function getAvatarExtension(contentType: string) {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}
