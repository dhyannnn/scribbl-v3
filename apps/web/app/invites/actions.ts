"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptWorkspaceInviteByToken } from "@/lib/workspace-invite-acceptance";
import { getCurrentUser } from "@/lib/current-user";

export async function acceptWorkspaceInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");

  if (!token) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/invites/${token}`)}`);
  }

  const result = await acceptWorkspaceInviteByToken(token, currentUser);

  if (!result.ok) {
    if (result.workspaceId) {
      revalidatePath(`/workspaces/${result.workspaceId}/members`);
    }
    if (result.redirectHref) {
      redirect(result.redirectHref);
    }
    return;
  }

  revalidatePath(`/workspaces/${result.workspaceId}`);
  revalidatePath(`/workspaces/${result.workspaceId}/members`);
  revalidatePath(`/workspaces/${result.workspaceId}/meetings`);
  for (const meetingId of result.meetingIds) {
    revalidatePath(`/workspaces/${result.workspaceId}/meetings/${meetingId}`);
  }
  revalidatePath("/");
  redirect(`/workspaces/${result.workspaceId}?workspace=${result.notificationStatus}`);
}
