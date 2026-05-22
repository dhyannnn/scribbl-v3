import Stripe from "stripe";

// Lazily instantiate so the module can be imported during `next build`
// without the env var present. The instance is created on first API call.
let _stripe: Stripe | undefined;

function getInstance(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_, prop: string | symbol) {
    return getInstance()[prop as keyof Stripe];
  },
});

export const STRIPE_PRICE_PRO_BASE_CAD = process.env.STRIPE_PRICE_PRO_BASE_CAD!;
export const STRIPE_PRICE_INSTITUTION_BASE_CAD = process.env.STRIPE_PRICE_INSTITUTION_BASE_CAD!;
