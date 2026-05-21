import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
});

export const STRIPE_PRICE_PRO_BASE_CAD = process.env.STRIPE_PRICE_PRO_BASE_CAD!;
export const STRIPE_PRICE_INSTITUTION_BASE_CAD = process.env.STRIPE_PRICE_INSTITUTION_BASE_CAD!;
