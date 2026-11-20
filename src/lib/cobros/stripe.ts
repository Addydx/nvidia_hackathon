import Stripe from "stripe";
import { HttpError } from "../caja/service";

/**
 * Subconjunto de la API de Stripe que usa la app. Detrás de esta interfaz el servicio no depende
 * del SDK (se prueba con un doble) y las llamadas reales quedan en un único adaptador.
 */
export type StripeSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  expires_at: number;
};
export type StripeAccountInfo = { id: string; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };

export interface StripeApi {
  createSession(params: Stripe.Checkout.SessionCreateParams, opts: { idempotencyKey: string; stripeAccount?: string }): Promise<StripeSession>;
  retrieveSession(id: string, stripeAccount?: string): Promise<StripeSession>;
  createAccount(userId: string): Promise<StripeAccountInfo>;
  retrieveAccount(id: string): Promise<StripeAccountInfo>;
  createAccountLink(accountId: string, urls: { refresh: string; ret: string }): Promise<string>;
}

export function stripeKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  return k && /^(sk|rk)_(test|live)_/.test(k) ? k : null;
}

export const stripeConfigured = () => stripeKey() !== null;
/** «test» o «live» según el prefijo de la clave (para avisar en pantalla; nunca se expone la clave). */
export const stripeMode = (): "test" | "live" | null => {
  const k = stripeKey();
  return k ? (k.includes("_live_") ? "live" : "test") : null;
};
export const connectEnabled = () => process.env.STRIPE_CONNECT_ENABLED === "true";

let client: Stripe | null = null;
export function getStripeClient(): Stripe {
  const key = stripeKey();
  if (!key) throw new HttpError(503, "Los cobros con Stripe no están configurados todavía");
  return (client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000, appInfo: { name: "VendIA" } }));
}

const info = (a: Stripe.Account): StripeAccountInfo => ({
  id: a.id,
  charges_enabled: !!a.charges_enabled,
  payouts_enabled: !!a.payouts_enabled,
  details_submitted: !!a.details_submitted,
});

export function getStripeApi(): StripeApi {
  const s = getStripeClient();
  return {
    async createSession(params, { idempotencyKey, stripeAccount }) {
      return (await s.checkout.sessions.create(params, { idempotencyKey, ...(stripeAccount ? { stripeAccount } : {}) })) as unknown as StripeSession;
    },
    async retrieveSession(id, stripeAccount) {
      return (await s.checkout.sessions.retrieve(id, undefined, stripeAccount ? { stripeAccount } : undefined)) as unknown as StripeSession;
    },
    // Cuenta Express de Stripe Connect con onboarding alojado por Stripe (documentado en docs.stripe.com/connect).
    async createAccount(userId) {
      const a = await s.accounts.create(
        { type: "express", country: "MX", capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { user_id: userId } },
        { idempotencyKey: `acct-${userId}` },
      );
      return info(a);
    },
    async retrieveAccount(id) {
      return info(await s.accounts.retrieve(id));
    },
    async createAccountLink(accountId, { refresh, ret }) {
      const l = await s.accountLinks.create({ account: accountId, refresh_url: refresh, return_url: ret, type: "account_onboarding" });
      return l.url;
    },
  };
}

/** Verifica la firma del webhook con el cuerpo CRUDO. Prueba el secreto de la cuenta y, si existe, el de Connect. */
export function verifyWebhook(rawBody: string, signature: string | null): Stripe.Event {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].map((v) => v?.trim()).filter((v): v is string => !!v);
  if (secrets.length === 0) throw new HttpError(503, "El webhook de Stripe no está configurado");
  if (!signature) throw new HttpError(400, "Falta la firma");
  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      /* prueba el siguiente secreto */
    }
  }
  throw new HttpError(400, "Firma no válida");
}
