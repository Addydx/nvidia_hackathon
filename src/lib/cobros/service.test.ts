import { describe, expect, it, beforeEach, vi } from "vitest";
import Stripe from "stripe";
import { applySession, createCharge, getCharge, handleWebhookEvent, startConnectOnboarding, type Deps, type WebhookEvent } from "./service";
import { verifyWebhook, type StripeApi, type StripeSession } from "./stripe";
import type { CobrosRepo, ConnectedAccount, Payment } from "./types";

const U1 = { id: "11111111-1111-4111-8111-111111111111", email: "uno@example.com" };
const U2 = { id: "22222222-2222-4222-8222-222222222222", email: "dos@example.com" };
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function memoryRepo(): CobrosRepo & { rows: Map<string, Payment>; events: Set<string>; accounts: Map<string, ConnectedAccount> } {
  const rows = new Map<string, Payment>();
  const events = new Set<string>();
  const accounts = new Map<string, ConnectedAccount>();
  const bySession = (s: string) => [...rows.values()].find((p) => p.stripeSessionId === s) ?? null;
  return {
    rows, events, accounts,
    async getOwned(u, id) { const p = rows.get(id); return p && p.userId === u ? p : null; },
    async insertOnce(u, { id, amountCents, stripeAccountId }) {
      const cur = rows.get(id);
      if (cur) return cur.userId === u ? { payment: cur, created: false } : null;
      const p: Payment = { id, userId: u, amountCents, status: "pending", stripeAccountId, stripeSessionId: null, stripePaymentIntentId: null, checkoutUrl: null, expiresAt: null, paidAt: null, createdAt: new Date().toISOString() };
      rows.set(id, p);
      return { payment: p, created: true };
    },
    async attachSession(id, s) { const p = rows.get(id)!; if (!p.stripeSessionId) Object.assign(p, { stripeSessionId: s.sessionId, checkoutUrl: s.url, expiresAt: s.expiresAt }); return p; },
    async deleteUnattached(u, id) { const p = rows.get(id); if (p && p.userId === u && !p.stripeSessionId) rows.delete(id); },
    async list(u) { return [...rows.values()].filter((p) => p.userId === u); },
    async countSince(u) { return [...rows.values()].filter((p) => p.userId === u).length; },
    async findBySession(s) { return bySession(s); },
    async applyStatus(s, status, pi, paidAt) {
      const p = bySession(s);
      if (p && p.status !== "paid") Object.assign(p, { status, stripePaymentIntentId: pi ?? p.stripePaymentIntentId, paidAt: status === "paid" ? paidAt ?? "now" : p.paidAt });
      return p;
    },
    async eventSeen(e) { return events.has(e); },
    async recordEvent(e) { events.add(e); },
    async getAccount(u) { return accounts.get(u) ?? null; },
    async upsertAccount(a) { accounts.set(a.userId, a); },
    async updateAccountFlags(id, f) { for (const a of accounts.values()) if (a.stripeAccountId === id) Object.assign(a, f); },
  };
}

/** Doble de Stripe: guarda sesiones y respeta la llave de idempotencia como la API real. */
function fakeStripe() {
  const sessions = new Map<string, StripeSession>();
  const byKey = new Map<string, string>();
  const calls = { create: 0, createAccount: 0 };
  let failNext = false;
  const api: StripeApi = {
    async createSession(params, { idempotencyKey }) {
      calls.create++;
      if (failNext) { failNext = false; throw new Error("stripe caído"); }
      const known = byKey.get(idempotencyKey);
      if (known) return sessions.get(known)!;
      const line = params.line_items![0].price_data!;
      const s: StripeSession = {
        id: `cs_test_${sessions.size + 1}`, url: `https://checkout.stripe.com/c/pay/cs_test_${sessions.size + 1}`,
        status: "open", payment_status: "unpaid", amount_total: line.unit_amount!, currency: line.currency!,
        payment_intent: null, client_reference_id: params.client_reference_id!, metadata: params.metadata as Record<string, string>,
        expires_at: params.expires_at!,
      };
      sessions.set(s.id, s); byKey.set(idempotencyKey, s.id);
      return s;
    },
    async retrieveSession(id) { return sessions.get(id)!; },
    async createAccount() { calls.createAccount++; return { id: "acct_1", charges_enabled: false, payouts_enabled: false, details_submitted: false }; },
    async retrieveAccount(id) { return { id, charges_enabled: true, payouts_enabled: true, details_submitted: true }; },
    async createAccountLink() { return "https://connect.stripe.com/setup/e/acct_1/xyz"; },
  };
  return { api, sessions, calls, failNext: () => { failNext = true; } };
}

let repo: ReturnType<typeof memoryRepo>;
let st: ReturnType<typeof fakeStripe>;
let d: Deps;
beforeEach(() => {
  repo = memoryRepo(); st = fakeStripe();
  d = { repo, stripe: st.api, baseUrl: "https://nvidia.addydx.com", connectEnabled: false, ownerEmails: [] };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const evt = (id: string, type: string, sessionId: string, account?: string): WebhookEvent => ({ id, type, account, data: { object: { id: sessionId } } });
const pay = (sessionId: string) => { Object.assign(st.sessions.get(sessionId)!, { status: "complete", payment_status: "paid", payment_intent: "pi_1" }); };

describe("crear cobro", () => {
  it("valida el importe en centavos enteros", async () => {
    for (const bad of [999, 0, -5, 10.5, "1000", null, 100_000_000]) {
      await expect(createCharge(d, U1, { id: ID, amountCents: bad })).rejects.toMatchObject({ status: 400 });
    }
    await expect(createCharge(d, U1, { id: "no-uuid", amountCents: 5000 })).rejects.toMatchObject({ status: 400 });
    expect(st.calls.create).toBe(0);
  });

  it("crea la sesión con el importe y la referencia únicos, y devuelve la URL real de Checkout", async () => {
    const { payment, duplicate } = await createCharge(d, U1, { id: ID, amountCents: 15050 });
    expect(duplicate).toBe(false);
    expect(payment.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(payment.amountCents).toBe(15050);
    const s = [...st.sessions.values()][0];
    expect(s).toMatchObject({ amount_total: 15050, currency: "mxn", client_reference_id: ID, metadata: { payment_id: ID } });
  });

  it("es idempotente: el mismo id no crea otra sesión ni otro cobro", async () => {
    const a = await createCharge(d, U1, { id: ID, amountCents: 5000 });
    const b = await createCharge(d, U1, { id: ID, amountCents: 5000 });
    expect(b.duplicate).toBe(true);
    expect(b.payment.checkoutUrl).toBe(a.payment.checkoutUrl);
    expect(repo.rows.size).toBe(1);
    expect(st.sessions.size).toBe(1);
  });

  it("reintentar tras un corte (fila sin sesión) reutiliza la sesión por llave de idempotencia", async () => {
    await repo.insertOnce(U1.id, { id: ID, amountCents: 5000, stripeAccountId: null });
    const r = await createCharge(d, U1, { id: ID, amountCents: 5000 });
    expect(r.payment.checkoutUrl).toBeTruthy();
    expect(st.sessions.size).toBe(1);
  });

  it("si Stripe falla no deja un cobro huérfano", async () => {
    st.failNext();
    await expect(createCharge(d, U1, { id: ID, amountCents: 5000 })).rejects.toMatchObject({ status: 502 });
    expect(repo.rows.size).toBe(0);
  });

  it("un id ya usado por otro usuario o con otro importe se rechaza", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    await expect(createCharge(d, U2, { id: ID, amountCents: 5000 })).rejects.toMatchObject({ status: 409 });
    const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await repo.insertOnce(U1.id, { id: other, amountCents: 5000, stripeAccountId: null });
    await expect(createCharge(d, U1, { id: other, amountCents: 7000 })).rejects.toMatchObject({ status: 409 });
  });

  it("solo el propietario cobra en su cuenta cuando hay lista de propietarios", async () => {
    d.ownerEmails = ["uno@example.com"];
    await expect(createCharge(d, U2, { id: ID, amountCents: 5000 })).rejects.toMatchObject({ status: 403 });
    expect((await createCharge(d, U1, { id: ID, amountCents: 5000 })).payment.id).toBe(ID);
    expect(repo.rows.get(ID)!.stripeAccountId).toBeNull();
  });
});

describe("aislamiento entre usuarios", () => {
  it("un cobro ajeno responde como inexistente", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    expect(await getCharge(d, U2.id, ID)).toBeNull();
    expect(await getCharge(d, U1.id, ID)).not.toBeNull();
    expect(await repo.list(U2.id, 20)).toEqual([]);
  });
});

describe("confirmación", () => {
  it("la redirección del navegador no confirma nada: sin pago en Stripe sigue pendiente", async () => {
    const { payment } = await createCharge(d, U1, { id: ID, amountCents: 5000 });
    expect((await getCharge(d, U1.id, ID))!.status).toBe("pending");
    expect(payment.status).toBe("pending");
  });

  it("el webhook confirma consultando el estado real en Stripe", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    pay("cs_test_1");
    expect(await handleWebhookEvent(d, evt("evt_1", "checkout.session.completed", "cs_test_1"))).toBe("processed");
    const p = (await getCharge(d, U1.id, ID))!;
    expect(p.status).toBe("paid");
    expect(p.paidAt).toBeTruthy();
    expect(repo.rows.get(ID)!.stripePaymentIntentId).toBe("pi_1");
  });

  it("un evento «completed» con pago diferido sin acreditar queda en procesando, no pagado", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    Object.assign(st.sessions.get("cs_test_1")!, { status: "complete", payment_status: "unpaid" });
    await handleWebhookEvent(d, evt("evt_1", "checkout.session.completed", "cs_test_1"));
    expect(repo.rows.get(ID)!.status).toBe("processing");
    pay("cs_test_1");
    await handleWebhookEvent(d, evt("evt_2", "checkout.session.async_payment_succeeded", "cs_test_1"));
    expect(repo.rows.get(ID)!.status).toBe("paid");
  });

  it("falla asíncrona y vencimiento", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    Object.assign(st.sessions.get("cs_test_1")!, { status: "complete", payment_status: "unpaid" });
    await handleWebhookEvent(d, evt("evt_1", "checkout.session.async_payment_failed", "cs_test_1"));
    expect(repo.rows.get(ID)!.status).toBe("failed");

    const id2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await createCharge(d, U1, { id: id2, amountCents: 5000 });
    Object.assign(st.sessions.get("cs_test_2")!, { status: "expired" });
    await handleWebhookEvent(d, evt("evt_2", "checkout.session.expired", "cs_test_2"));
    expect(repo.rows.get(id2)!.status).toBe("expired");
  });

  it("es idempotente: reenviar el mismo evento no repite nada, y «paid» nunca se revierte", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    pay("cs_test_1");
    const spy = vi.spyOn(st.api, "retrieveSession");
    expect(await handleWebhookEvent(d, evt("evt_1", "checkout.session.completed", "cs_test_1"))).toBe("processed");
    expect(await handleWebhookEvent(d, evt("evt_1", "checkout.session.completed", "cs_test_1"))).toBe("duplicate");
    expect(spy).toHaveBeenCalledTimes(1);
    // evento tardío de vencimiento/fallo con otro id: no degrada un cobro pagado
    Object.assign(st.sessions.get("cs_test_1")!, { status: "expired", payment_status: "unpaid" });
    await handleWebhookEvent(d, evt("evt_2", "checkout.session.expired", "cs_test_1"));
    expect(repo.rows.get(ID)!.status).toBe("paid");
  });

  it("no confirma si importe, moneda o referencia no coinciden", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    pay("cs_test_1");
    const s = st.sessions.get("cs_test_1")!;
    for (const tamper of [{ amount_total: 100 }, { currency: "usd" }, { client_reference_id: "otro" }, { metadata: { payment_id: "otro" } }]) {
      const orig = { ...s };
      Object.assign(s, tamper);
      const out = await applySession(repo, repo.rows.get(ID)!, s);
      expect(out.status).toBe("pending");
      Object.assign(s, orig);
    }
  });

  it("ignora sesiones desconocidas y eventos de otra cuenta", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    pay("cs_test_1");
    expect(await handleWebhookEvent(d, evt("evt_x", "checkout.session.completed", "cs_otro"))).toBe("ignored");
    expect(await handleWebhookEvent(d, evt("evt_y", "checkout.session.completed", "cs_test_1", "acct_ajena"))).toBe("ignored");
    expect(repo.rows.get(ID)!.status).toBe("pending");
  });

  it("el sondeo del servidor concilia con Stripe si el webhook aún no llegó", async () => {
    await createCharge(d, U1, { id: ID, amountCents: 5000 });
    pay("cs_test_1");
    expect((await getCharge(d, U1.id, ID))!.status).toBe("paid");
  });
});

describe("webhook firmado", () => {
  const secret = "whsec_test_secreto";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } });
  const sign = (body: string, s = secret) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret: s });

  it("acepta una firma válida y rechaza las demás", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    expect(verifyWebhook(payload, sign(payload)).id).toBe("evt_1");
    expect(() => verifyWebhook(payload, sign(payload, "whsec_otro"))).toThrow(/Firma/);
    expect(() => verifyWebhook(payload + " ", sign(payload))).toThrow(/Firma/); // cuerpo alterado
    expect(() => verifyWebhook(payload, null)).toThrow(/firma/);
    vi.unstubAllEnvs();
  });

  it("sin secreto configurado responde 503", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    expect(() => verifyWebhook(payload, "t=1,v1=x")).toThrow(/no está configurado/);
    vi.unstubAllEnvs();
  });

  it("acepta también el secreto del webhook de Connect", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect");
    expect(verifyWebhook(payload, sign(payload, "whsec_connect")).id).toBe("evt_1");
    vi.unstubAllEnvs();
  });
});

describe("Stripe Connect", () => {
  it("desactivado: no crea nada ni simula conexión", async () => {
    await expect(startConnectOnboarding(d, U1.id)).rejects.toMatchObject({ status: 503 });
    expect(st.calls.createAccount).toBe(0);
    expect(repo.accounts.size).toBe(0);
  });

  it("activado: crea la cuenta una sola vez y devuelve el enlace alojado por Stripe", async () => {
    d.connectEnabled = true;
    const a = await startConnectOnboarding(d, U1.id);
    const b = await startConnectOnboarding(d, U1.id);
    expect(a.url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    expect(b.url).toBe(a.url);
    expect(st.calls.createAccount).toBe(1);
  });

  it("con Connect activo, un vendedor no propietario cobra en SU cuenta y solo si ya puede cobrar", async () => {
    d.connectEnabled = true;
    d.ownerEmails = ["uno@example.com"];
    await expect(createCharge(d, U2, { id: ID, amountCents: 5000 })).rejects.toMatchObject({ status: 409 });
    await repo.upsertAccount({ userId: U2.id, stripeAccountId: "acct_dos", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
    await createCharge(d, U2, { id: ID, amountCents: 5000 });
    expect(repo.rows.get(ID)!.stripeAccountId).toBe("acct_dos");
  });
});
