"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_PRO_PRICE_ID } from "@/lib/stripe";

async function assertOwner(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  });
  if (membership?.role !== "OWNER" || membership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/billing?billing=unauthorized`);
  }
}

export async function upgradeWorkspaceToPro(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  await assertOwner(workspaceId, currentUser.id);

  // Find or create Stripe customer + subscription record
  let stripeCustomerId: string;
  const existingSub = await prisma.subscription.findFirst({
    where: { workspaceId },
    select: { stripeCustomerId: true },
  });

  if (existingSub?.stripeCustomerId) {
    stripeCustomerId = existingSub.stripeCustomerId;
  } else {
    const customer = await stripe.customers.create({
      email: currentUser.email,
      name: currentUser.displayName,
      metadata: { userId: currentUser.id, workspaceId },
    });
    stripeCustomerId = customer.id;
    await prisma.subscription.create({
      data: { stripeCustomerId, plan: "FREE", status: "INCOMPLETE", workspaceId },
    });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  // Create checkout session — keep redirect outside try/catch so it isn't swallowed
  let sessionUrl: string;
  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
      success_url: `${appUrl}/workspaces/${workspaceId}/billing?billing=success`,
      cancel_url: `${appUrl}/workspaces/${workspaceId}/billing?billing=canceled`,
    });
    sessionUrl = session.url!;
  } catch (err) {
    console.error("[stripe checkout error]", err);
    redirect(`/workspaces/${workspaceId}/billing?billing=checkout-failed`);
  }

  redirect(sessionUrl);
}

export async function refreshBillingStatus(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  await assertOwner(workspaceId, currentUser.id);

  const { syncWorkspacePlanFromStripe } = await import("@/lib/billing");
  await syncWorkspacePlanFromStripe(workspaceId);

  redirect(`/workspaces/${workspaceId}/billing?billing=refreshed`);
}

export async function openBillingPortal(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  await assertOwner(workspaceId, currentUser.id);

  const subscription = await prisma.subscription.findFirst({
    where: { workspaceId },
    select: { stripeCustomerId: true },
  });

  if (!subscription?.stripeCustomerId) {
    redirect(`/workspaces/${workspaceId}/billing?billing=no-subscription`);
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  let portalUrl: string;
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/workspaces/${workspaceId}/billing`,
    });
    portalUrl = portalSession.url;
  } catch {
    redirect(`/workspaces/${workspaceId}/billing?billing=portal-failed`);
  }

  redirect(portalUrl);
}
