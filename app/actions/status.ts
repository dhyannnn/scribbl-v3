"use server";

import type { UserStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function updateUserStatus(status: UserStatus) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;
  await prisma.user.update({
    where: { id: currentUser.id },
    data: { status },
  });
}
