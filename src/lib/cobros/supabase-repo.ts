import { createClient } from "@supabase/supabase-js";
import type { ConnectedAccount, CobrosRepo, Payment, PaymentStatus } from "./types";

type Row = {
  id: string; user_id: string; amount_cents: number; status: PaymentStatus; stripe_account_id: string | null;
  stripe_session_id: string | null; stripe_payment_intent_id: string | null; checkout_url: string | null;
  expires_at: string | null; paid_at: string | null; created_at: string;
};
type AccountRow = { user_id: string; stripe_account_id: string; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };

const COLS = "id, user_id, amount_cents, status, stripe_account_id, stripe_session_id, stripe_payment_intent_id, checkout_url, expires_at, paid_at, created_at";

const toPayment = (r: Row): Payment => ({
  id: r.id,
  userId: r.user_id,
  amountCents: Number(r.amount_cents),
  status: r.status,
  stripeAccountId: r.stripe_account_id,
  stripeSessionId: r.stripe_session_id,
  stripePaymentIntentId: r.stripe_payment_intent_id,
  checkoutUrl: r.checkout_url,
  expiresAt: r.expires_at,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});
const toAccount = (r: AccountRow): ConnectedAccount => ({
  userId: r.user_id,
  stripeAccountId: r.stripe_account_id,
  chargesEnabled: r.charges_enabled,
  payoutsEnabled: r.payouts_enabled,
  detailsSubmitted: r.details_submitted,
});

/** Service role (ignora RLS): por eso cada consulta por usuario filtra por user_id. */
export function createSupabaseCobrosRepo(url: string, serviceKey: string): CobrosRepo {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  return {
    async getOwned(userId, id) {
      const { data, error } = await db.from("payments").select(COLS).eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ? toPayment(data as Row) : null;
    },
    async insertOnce(userId, { id, amountCents, stripeAccountId }) {
      const { data, error } = await db
        .from("payments")
        .upsert({ id, user_id: userId, amount_cents: amountCents, stripe_account_id: stripeAccountId }, { onConflict: "id", ignoreDuplicates: true })
        .select(COLS);
      if (error) throw error;
      if (data && data.length > 0) return { payment: toPayment(data[0] as Row), created: true };
      const existing = await this.getOwned(userId, id);
      return existing ? { payment: existing, created: false } : null; // id de otro usuario
    },
    async attachSession(id, { sessionId, url: checkoutUrl, expiresAt }) {
      const { data, error } = await db
        .from("payments")
        .update({ stripe_session_id: sessionId, checkout_url: checkoutUrl, expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq("id", id)
        .is("stripe_session_id", null)
        .select(COLS);
      if (error) throw error;
      if (data && data.length > 0) return toPayment(data[0] as Row);
      // Ya estaba asociado (reintento): devuelve la fila tal cual.
      const { data: cur, error: e2 } = await db.from("payments").select(COLS).eq("id", id).single();
      if (e2) throw e2;
      return toPayment(cur as Row);
    },
    async deleteUnattached(userId, id) {
      const { error } = await db.from("payments").delete().eq("id", id).eq("user_id", userId).is("stripe_session_id", null);
      if (error) throw error;
    },
    async list(userId, limit) {
      const { data, error } = await db.from("payments").select(COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => toPayment(r as Row));
    },
    async countSince(userId, sinceIso) {
      const { count, error } = await db.from("payments").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
      if (error) throw error;
      return count ?? 0;
    },
    async findBySession(sessionId) {
      const { data, error } = await db.from("payments").select(COLS).eq("stripe_session_id", sessionId).maybeSingle();
      if (error) throw error;
      return data ? toPayment(data as Row) : null;
    },
    async applyStatus(sessionId, status, paymentIntentId, paidAt) {
      const { data, error } = await db.rpc("apply_payment_status", {
        p_session_id: sessionId, p_status: status, p_payment_intent: paymentIntentId, p_paid_at: paidAt,
      });
      if (error) throw error;
      const r = data as Row | null;
      return r && r.id ? toPayment(r) : null;
    },
    async eventSeen(eventId) {
      const { data, error } = await db.from("stripe_events").select("id").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async recordEvent(eventId, type) {
      const { error } = await db.from("stripe_events").upsert({ id: eventId, type }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    },
    async getAccount(userId) {
      const { data, error } = await db.from("stripe_accounts").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ? toAccount(data as AccountRow) : null;
    },
    async upsertAccount(a) {
      const { error } = await db.from("stripe_accounts").upsert({
        user_id: a.userId, stripe_account_id: a.stripeAccountId, charges_enabled: a.chargesEnabled,
        payouts_enabled: a.payoutsEnabled, details_submitted: a.detailsSubmitted, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
    },
    async updateAccountFlags(stripeAccountId, f) {
      const { error } = await db.from("stripe_accounts").update({
        charges_enabled: f.chargesEnabled, payouts_enabled: f.payoutsEnabled, details_submitted: f.detailsSubmitted, updated_at: new Date().toISOString(),
      }).eq("stripe_account_id", stripeAccountId);
      if (error) throw error;
    },
  };
}
