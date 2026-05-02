"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "STUDY_GROUP");
  const description = String(formData.get("description") ?? "").trim();

  if (!name || !["COURSE", "STUDY_GROUP", "TUTORING_GROUP"].includes(type)) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name,
      type: type as "COURSE" | "STUDY_GROUP" | "TUTORING_GROUP",
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
        create: {
          name: "general",
          type: "CHAT",
          createdByUserId: currentUser.id,
        },
      },
    },
  });

  revalidatePath("/");
  redirect(`/workspaces/${workspace.id}`);
}
