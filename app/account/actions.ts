"use server";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentUser, getSupabaseAuthUser } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { RateLimits } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function updateAccountProfile(formData: FormData) {
  const currentUser = await getCurrentUser();
  const authUser = await getSupabaseAuthUser();

  if (!currentUser || !authUser) {
    redirect("/login?next=/account");
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const resolvedDisplayName = displayName || [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];

  if (!firstName || !lastName || !email) {
    redirect("/account?message=Enter your first name, last name, and email address");
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
    },
  });

  const message =
    confirmedEmail === email
      ? "Account updated"
      : "Profile updated. Check your email to confirm the new address.";

  redirect(`/account?message=${encodeURIComponent(message)}`);
}

export async function updateAccountPassword(formData: FormData) {
  const authUser = await getSupabaseAuthUser();

  if (!authUser) {
    redirect("/login?next=/account");
  }

  if (!RateLimits.passwordUpdate(authUser.id)) {
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

  if (!RateLimits.accountDelete(currentUser.id)) {
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
