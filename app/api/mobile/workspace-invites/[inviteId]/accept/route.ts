import { NextResponse } from "next/server";
import type { MobileAcceptInviteResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { mobileUnauthorized, serializeWorkspace } from "@/lib/mobile-api";
import { acceptWorkspaceInviteById } from "@/lib/workspace-invite-acceptance";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ inviteId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const { inviteId } = await context.params;
  const result = await acceptWorkspaceInviteById(inviteId, user);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const response: MobileAcceptInviteResponse = {
    workspace: serializeWorkspace(result.workspaceMembership),
  };

  return NextResponse.json(response);
}
