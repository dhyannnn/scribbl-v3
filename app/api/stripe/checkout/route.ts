"use server";

import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_PRO_PRICE_ID, STRIPE_INSTITUTION_PRICE_ID } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan, workspaceId, organizationId } = await request.json() as {
    plan: "PRO" | "INSTITUTION";
    workspaceId?: string;
    organizationId?: string;
  };

  if (!plan || (plan === "PRO" && !workspaceId) || (plan === "INSTITUTION" && !organizationId)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Only the workspace OWNER may initiate a checkout
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    });
    if (membership?.role !== "OWNER" || membership.status !== "ACTIVE") {
      return Response.json({ error: "Only the workspace owner can manage billing" }, { status: 403 });
    }
  }

  const priceId = plan === "INSTITUTION" ? STRIPE_INSTITUTION_PRICE_ID : STRIPE_PRO_PRICE_ID;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  // Find or create Stripe customer
  let stripeCustomerId: string;
  const existing = await prisma.subscription.findFirst({
    where: workspaceId
      ? { workspaceId }
      : { organizationId },
  });

  if (existing?.stripeCustomerId) {
    stripeCustomerId = existing.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: currentUser.email,
      name: currentUser.displayName,
      metadata: {
        userId: currentUser.id,
        ...(workspaceId ? { workspaceId } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
    });
    stripeCustomerId = customer.id;

    // Create the subscription record so the webhook can find it
    await prisma.subscription.create({
      data: {
        stripeCustomerId,
        plan: "FREE",
        status: "INCOMPLETE",
        ...(workspaceId ? { workspaceId } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  const successUrl = workspaceId
    ? `${appUrl}/workspaces/${workspaceId}?billing=success`
    : `${appUrl}?billing=success`;

  const cancelUrl = workspaceId
    ? `${appUrl}/workspaces/${workspaceId}?billing=canceled`
    : `${appUrl}?billing=canceled`;

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    automatic_tax: { enabled: true },
    customer_update: { address: "auto" },
    subscription_data: {
      metadata: {
        userId: currentUser.id,
        ...(workspaceId ? { workspaceId } : {}),
        ...(organizationId ? { organizationId } : {}),
      },
    },
  });

  return Response.json({ url: session.url });
}
