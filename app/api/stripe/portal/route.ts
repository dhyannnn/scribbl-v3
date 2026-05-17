"use server";

import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, organizationId } = await request.json() as {
    workspaceId?: string;
    organizationId?: string;
  };

  // Only the workspace OWNER may access the billing portal
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    });
    if (membership?.role !== "OWNER" || membership.status !== "ACTIVE") {
      return Response.json({ error: "Only the workspace owner can manage billing" }, { status: 403 });
    }
  }

  const subscription = await prisma.subscription.findFirst({
    where: workspaceId ? { workspaceId } : { organizationId },
  });

  if (!subscription?.stripeCustomerId) {
    return Response.json({ error: "No billing account found" }, { status: 404 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const returnUrl = workspaceId
    ? `${appUrl}/workspaces/${workspaceId}`
    : appUrl;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return Response.json({ url: portalSession.url });
}
