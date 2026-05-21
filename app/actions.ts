"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { FREE_WORKSPACE_LIMIT, getOwnedWorkspaceCount, userHasPaidWorkspace } from "@/lib/billing";

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "TEAM");
  const description = String(formData.get("description") ?? "").trim();

  if (!name || !["TEAM", "PROJECT", "CLASS"].includes(type)) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  // Free users can own 1 workspace. A paid workspace unlocks unlimited creation.
  const [ownedCount, hasPaid] = await Promise.all([
    getOwnedWorkspaceCount(currentUser.id),
    userHasPaidWorkspace(currentUser.id),
  ]);
  if (ownedCount >= FREE_WORKSPACE_LIMIT && !hasPaid) {
    redirect("/?workspace=plan-limit");
  }

  const workspace = await prisma.workspace.create({
    data: {
      name,
      type: type as "TEAM" | "PROJECT" | "CLASS",
      description: description || null,
      createdByUserId: currentUser.id,
      members: {
        create: {
          userId: currentUser.id,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      },
      channels: {
        create: [
          {
            name: "announcements",
            type: "ANNOUNCEMENT",
            createdByUserId: currentUser.id,
          },
          {
            name: "general",
            type: "CHAT",
            createdByUserId: currentUser.id,
          },
        ],
      },
    },
  });

  revalidatePath("/");
  redirect(`/workspaces/${workspace.id}`);
}
