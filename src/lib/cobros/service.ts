import { MAX_CENTS } from "../money";
import { HttpError } from "../caja/service";
import type { CobrosRepo, Payment, PaymentStatus, PublicPayment } from "./types";
import type { StripeApi, StripeSession } from "./stripe";
import { MIN_CHARGE_CENTS } from "./constants";

export { MIN_CHARGE_CENTS };
const SESSION_TTL_S = 30 * 60 + 60; // Stripe exige ≥ 30 min
const MAX_PER_HOUR = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const toPublic = (p: Payment): PublicPayment => ({
  id: p.id, amountCents: p.amountCents, status: p.status, checkoutUrl: p.checkoutUrl,
  expiresAt: p.expiresAt, paidAt: p.paidAt, createdAt: p.createdAt,
});

export type Deps = {
  repo: CobrosRepo;
  stripe: StripeApi;
  /** URL pública de la app (success/cancel de Checkout). */
  baseUrl: string;
  connectEnabled: boolean;
  /** Correos que cobran en la cuenta Stripe del propietario. Vacío = cualquier usuario autenticado (demo). */
  ownerEmails: string[];
  now?: () => number;
};

export const parseOwnerEmails = (v: string | undefined) =>
  (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * ¿En qué cuenta de Stripe se cobra? v1: la del propietario (null). Con Connect activo y un correo que
 * no es del propietario, cada vendedor cobra en SU cuenta conectada y nunca en la del propietario.
 */
async function resolveAccount(d: Deps, user: { id: string; email: string }): Promise<string | null> {
  if (d.ownerEmails.length === 0 || d.ownerEmails.includes(user.email.toLowerCase())) return null;
  if (!d.connectEnabled) throw new HttpError(403, "Los cobros con Stripe están habilitados solo para la cuenta del propietario por ahora");
  const acct = await d.repo.getAccount(user.id);
  if (!acct || !acct.chargesEnabled) throw new HttpError(409, "Conecta tu cuenta de Stripe para poder cobrar");
  return acct.stripeAccountId;
}

export function deriveStatus(s: StripeSession, hint?: "async_failed"): PaymentStatus {
  if (s.payment_status === "paid") return "paid";
  if (s.status === "expired") return "expired";
  if (hint === "async_failed") return "failed";
  if (s.status === "complete") return "processing"; // pago diferido (p. ej. efectivo/transferencia) aún sin acreditar
  return "pending";
}

/**
 * ÚNICA vía por la que un cobro cambia de estado: parte del estado REAL de la sesión en Stripe (nunca de
 * una redirección del navegador) y exige que sesión, referencia, importe y moneda coincidan con lo que
 * guardamos. Si algo no cuadra no se confirma nada.
 */
export async function applySession(repo: CobrosRepo, payment: Payment, s: StripeSession, hint?: "async_failed"): Promise<Payment> {
  const consistent =
    payment.stripeSessionId === s.id &&
    s.metadata?.payment_id === payment.id &&
    s.client_reference_id === payment.id &&
    s.amount_total === payment.amountCents &&
    s.currency === "mxn";
  if (!consistent) {
    console.error("[cobros] la sesión de Stripe no coincide con el cobro; no se confirma", { payment: payment.id, session: s.id });
    return payment;
  }
  const status = deriveStatus(s, hint);
  const paidAt = status === "paid" ? new Date().toISOString() : null;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : null;
  return (await repo.applyStatus(s.id, status, pi, paidAt)) ?? payment;
}

export async function createCharge(d: Deps, user: { id: string; email: string }, input: { id: unknown; amountCents: unknown }): Promise<{ payment: PublicPayment; duplicate: boolean }> {
  const { id, amountCents } = input;
  if (typeof id !== "string" || !UUID.test(id)) throw new HttpError(400, "Identificador de cobro no válido");
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents > MAX_CENTS)
    throw new HttpError(400, "Importe no válido");
  if (amountCents < MIN_CHARGE_CENTS) throw new HttpError(400, "El cobro mínimo con Stripe es de $10.00 MXN");

  const existing = await d.repo.getOwned(user.id, id);
  if (existing?.checkoutUrl) return { payment: toPublic(existing), duplicate: true };

  const account = existing ? existing.stripeAccountId : await resolveAccount(d, user);
  if (!existing) {
    const since = new Date((d.now?.() ?? Date.now()) - 3_600_000).toISOString();
    if ((await d.repo.countSince(user.id, since)) >= MAX_PER_HOUR) throw new HttpError(429, "Demasiados cobros en poco tiempo. Espera unos minutos.");
  }
  const ins = await d.repo.insertOnce(user.id, { id, amountCents: existing?.amountCents ?? amountCents, stripeAccountId: account });
  if (!ins) throw new HttpError(409, "Este identificador ya se usó con otro cobro");
  const row = ins.payment;
  if (row.amountCents !== amountCents) throw new HttpError(409, "Este identificador ya se usó con otro importe");

  let session: StripeSession;
  try {
    // La llave de idempotencia es el id del cobro: reintentar tras un corte devuelve LA MISMA sesión.
    session = await d.stripe.createSession(
      {
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: row.amountCents, product_data: { name: "Cobro VendIA" } } }],
        client_reference_id: row.id,
        metadata: { payment_id: row.id },
        payment_intent_data: { metadata: { payment_id: row.id } },
        expires_at: Math.floor((d.now?.() ?? Date.now()) / 1000) + SESSION_TTL_S,
        success_url: `${d.baseUrl}/pago/gracias`,
        cancel_url: `${d.baseUrl}/pago/cancelado`,
      },
      { idempotencyKey: `checkout-${row.id}`, ...(row.stripeAccountId ? { stripeAccount: row.stripeAccountId } : {}) },
    );
  } catch (e) {
    console.error("[cobros] Stripe rechazó la creación de la sesión", e instanceof Error ? e.message : e);
    if (ins.created) await d.repo.deleteUnattached(user.id, row.id);
    throw new HttpError(502, "Stripe no pudo crear el cobro. Inténtalo de nuevo.");
  }
  if (!session.url) throw new HttpError(502, "Stripe no devolvió el enlace de pago");

  const attached = await d.repo.attachSession(row.id, {
    sessionId: session.id,
    url: session.url,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
  });
  return { payment: toPublic(attached), duplicate: !ins.created };
}

/** Cobro del usuario. Si sigue en curso, lo concilia con Stripe (respaldo del webhook; sigue siendo el estado real de Stripe). */
export async function getCharge(d: Deps, userId: string, id: string): Promise<PublicPayment | null> {
  if (!UUID.test(id)) return null;
  let p = await d.repo.getOwned(userId, id);
  if (!p) return null;
  if ((p.status === "pending" || p.status === "processing") && p.stripeSessionId) {
    try {
      p = await applySession(d.repo, p, await d.stripe.retrieveSession(p.stripeSessionId, p.stripeAccountId ?? undefined));
    } catch (e) {
      console.error("[cobros] no se pudo consultar a Stripe", e instanceof Error ? e.message : e); // se conserva el estado guardado
    }
  }
  return toPublic(p);
}

export async function listCharges(d: Deps, userId: string): Promise<PublicPayment[]> {
  return (await d.repo.list(userId, 20)).map(toPublic);
}

/** Subconjunto de stripe.Event que usa el webhook. */
export type WebhookEvent = { id: string; type: string; account?: string; data: { object: Record<string, unknown> } };

const SESSION_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

/** Procesa un evento YA verificado por firma. Idempotente: reentregas no cambian nada. */
export async function handleWebhookEvent(d: Deps, ev: WebhookEvent): Promise<"processed" | "duplicate" | "ignored"> {
  if (await d.repo.eventSeen(ev.id)) return "duplicate";
  let result: "processed" | "ignored" = "ignored";

  if (SESSION_EVENTS.has(ev.type)) {
    const sessionId = typeof ev.data.object.id === "string" ? ev.data.object.id : null;
    const payment = sessionId ? await d.repo.findBySession(sessionId) : null;
    // Evento de otra cosa de la misma cuenta, o de una cuenta que no es la del cobro: se ignora.
    if (payment && (ev.account ?? null) === payment.stripeAccountId) {
      const session = await d.stripe.retrieveSession(payment.stripeSessionId!, payment.stripeAccountId ?? undefined);
      await applySession(d.repo, payment, session, ev.type === "checkout.session.async_payment_failed" ? "async_failed" : undefined);
      result = "processed";
    }
  } else if (ev.type === "account.updated" && typeof ev.data.object.id === "string") {
    const o = ev.data.object;
    await d.repo.updateAccountFlags(o.id as string, {
      chargesEnabled: !!o.charges_enabled, payoutsEnabled: !!o.payouts_enabled, detailsSubmitted: !!o.details_submitted,
    });
    result = "processed";
  }
  await d.repo.recordEvent(ev.id, ev.type);
  return result;
}

/* ---------------------------------- Stripe Connect ---------------------------------- */

export type ConnectStatus = { enabled: boolean; connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };

export async function getConnectStatus(d: Deps, userId: string, refresh = false): Promise<ConnectStatus> {
  if (!d.connectEnabled) return { enabled: false, connected: false, chargesEnabled: false, detailsSubmitted: false };
  let a = await d.repo.getAccount(userId);
  if (a && refresh) {
    const live = await d.stripe.retrieveAccount(a.stripeAccountId);
    a = { ...a, chargesEnabled: live.charges_enabled, payoutsEnabled: live.payouts_enabled, detailsSubmitted: live.details_submitted };
    await d.repo.upsertAccount(a);
  }
  return { enabled: true, connected: !!a, chargesEnabled: !!a?.chargesEnabled, detailsSubmitted: !!a?.detailsSubmitted };
}

/** Crea (o reutiliza) la cuenta conectada y devuelve el enlace de onboarding ALOJADO por Stripe. Nunca simula una conexión. */
export async function startConnectOnboarding(d: Deps, userId: string): Promise<{ url: string }> {
  if (!d.connectEnabled) throw new HttpError(503, "Stripe Connect aún no está activado en esta instalación");
  try {
    let a = await d.repo.getAccount(userId);
    if (!a) {
      const created = await d.stripe.createAccount(userId);
      a = { userId, stripeAccountId: created.id, chargesEnabled: created.charges_enabled, payoutsEnabled: created.payouts_enabled, detailsSubmitted: created.details_submitted };
      await d.repo.upsertAccount(a);
    }
    const url = await d.stripe.createAccountLink(a.stripeAccountId, { refresh: `${d.baseUrl}/cobrar?connect=refresh`, ret: `${d.baseUrl}/cobrar?connect=return` });
    return { url };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error("[cobros] Stripe Connect no disponible", e instanceof Error ? e.message : e);
    throw new HttpError(503, "Stripe Connect no está habilitado en la cuenta de Stripe de la plataforma. Actívalo en el Dashboard.");
  }
}
