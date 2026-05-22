"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

async function assertOwner(workspaceId: string, userId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  });
  if (membership?.role !== "OWNER" || membership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/billing?billing=unauthorized`);
  }
}

export async function upgradeWorkspaceToPlan(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const targetPlan = String(formData.get("plan") ?? "PRO");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  await assertOwner(workspaceId, currentUser.id);

  if (targetPlan !== "PRO" && targetPlan !== "INSTITUTION") {
    redirect(`/workspaces/${workspaceId}/billing?billing=invalid-plan`);
  }

  const currentWorkspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  // Enterprise changes must go through sales
  if (currentWorkspace?.plan === "ENTERPRISE") {
    redirect(`/workspaces/${workspaceId}/billing?billing=use-portal-to-change`);
  }

  const priceId =
    targetPlan === "INSTITUTION"
      ? process.env.STRIPE_PRICE_INSTITUTION_BASE_CAD!
      : process.env.STRIPE_PRICE_PRO_BASE_CAD!;

  // Find or create Stripe customer + subscription record
  let stripeCustomerId: string;
  const existingSub = await prisma.subscription.findFirst({
    where: { workspaceId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
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

  // Query Stripe directly for active subscriptions — never trust our DB's
  // stripeSubscriptionId, which can be stale if webhooks were failing.
  // Also auto-cancels any duplicate subscriptions found (cleanup).
  let updated = false;
  try {
    const activeSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "active",
    });

    // Filter out storage-overage-only subscriptions
    const mainSubs = activeSubs.data.filter(
      (s) => s.metadata?.type !== "storage-overage-only",
    );

    if (mainSubs.length > 0) {
      // Keep the most recently created, cancel any extras
      const [keep, ...duplicates] = [...mainSubs].sort((a, b) => b.created - a.created);

      for (const dup of duplicates) {
        await stripe.subscriptions.cancel(dup.id);
      }

      const itemId = keep.items.data[0]?.id;
      if (itemId) {
        await stripe.subscriptions.update(keep.id, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: "create_prorations",
        });

        // Sync the correct subscription ID back to our DB
        await prisma.subscription.updateMany({
          where: { workspaceId },
          data: { stripeSubscriptionId: keep.id },
        });

        updated = true;
      }
    }
  } catch (err) {
    console.error("[stripe subscription update error]", err);
  }

  // redirect() must be outside try/catch — it throws NEXT_REDIRECT internally
  if (updated) {
    redirect(`/workspaces/${workspaceId}/billing?billing=success`);
  }

  let sessionUrl: string;
  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/workspaces/${workspaceId}/billing?billing=success`,
      cancel_url: `${appUrl}/workspaces/${workspaceId}/billing?billing=canceled`,
      subscription_data: {
        metadata: { workspaceId },
      },
    });
    sessionUrl = session.url!;
  } catch (err) {
    console.error("[stripe checkout error]", err);
    redirect(`/workspaces/${workspaceId}/billing?billing=checkout-failed`);
  }

  redirect(sessionUrl);
}


export async function downgradeToFree(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  await assertOwner(workspaceId, currentUser.id);

  // Only allowed when there is no live Stripe subscription — if there is one,
  // the user must cancel through the billing portal so Stripe stops charging them.
  const existingSub = await prisma.subscription.findFirst({
    where: { workspaceId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });

  // Check Stripe directly for any active subscriptions on this customer
  if (existingSub?.stripeCustomerId) {
    const activeSubs = await stripe.subscriptions.list({
      customer: existingSub.stripeCustomerId,
      status: "active",
    });
    const hasActivePaidSub = activeSubs.data.some(
      (s) => s.metadata?.type !== "storage-overage-only",
    );
    if (hasActivePaidSub) {
      redirect(`/workspaces/${workspaceId}/billing?billing=use-portal-to-change`);
    }
  }

  await prisma.workspace.update({ where: { id: workspaceId }, data: { plan: "FREE" } });
  if (existingSub) {
    await prisma.subscription.updateMany({
      where: { workspaceId },
      data: { plan: "FREE", status: "CANCELED", stripeSubscriptionId: null },
    });

    // If they're over the Free storage limit, start a storage-overage subscription
    if (existingSub.stripeCustomerId) {
      const { createStorageOverageSubscriptionIfNeeded } = await import("@/lib/stripe-overage");
      await createStorageOverageSubscriptionIfNeeded(existingSub.stripeCustomerId, workspaceId);
    }
  }

  redirect(`/workspaces/${workspaceId}/billing?billing=success`);
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
