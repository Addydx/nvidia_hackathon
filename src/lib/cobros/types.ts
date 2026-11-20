export type PaymentStatus = "pending" | "processing" | "paid" | "failed" | "expired";

/** Forma interna (con datos de Stripe). Al navegador solo llega `PublicPayment`. */
export type Payment = {
  id: string;
  userId: string;
  amountCents: number;
  status: PaymentStatus;
  /** null = cuenta Stripe del propietario de la plataforma; "acct_…" = cuenta conectada. */
  stripeAccountId: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type PublicPayment = Pick<Payment, "id" | "amountCents" | "status" | "checkoutUrl" | "expiresAt" | "paidAt" | "createdAt">;

export type ConnectedAccount = {
  userId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

/**
 * Persistencia. Todo lo que recibe `userId` solo ve cobros de ese usuario: un cobro ajeno
 * se trata como inexistente. Las operaciones por sesión de Stripe (`…BySession`) son del
 * webhook y no tienen usuario; solo el servidor las invoca tras verificar la firma.
 */
export interface CobrosRepo {
  getOwned(userId: string, id: string): Promise<Payment | null>;
  /** INSERT … ON CONFLICT DO NOTHING. `created=false` si el id ya existía; null si pertenece a otro usuario. */
  insertOnce(userId: string, input: { id: string; amountCents: number; stripeAccountId: string | null }): Promise<{ payment: Payment; created: boolean } | null>;
  attachSession(id: string, s: { sessionId: string; url: string; expiresAt: string | null }): Promise<Payment>;
  deleteUnattached(userId: string, id: string): Promise<void>;
  list(userId: string, limit: number): Promise<Payment[]>;
  countSince(userId: string, sinceIso: string): Promise<number>;
  findBySession(sessionId: string): Promise<Payment | null>;
  /** Transición monótona: «paid» nunca se revierte. Devuelve la fila resultante. */
  applyStatus(sessionId: string, status: PaymentStatus, paymentIntentId: string | null, paidAt: string | null): Promise<Payment | null>;
  eventSeen(eventId: string): Promise<boolean>;
  recordEvent(eventId: string, type: string): Promise<void>;
  getAccount(userId: string): Promise<ConnectedAccount | null>;
  upsertAccount(a: ConnectedAccount): Promise<void>;
  updateAccountFlags(stripeAccountId: string, f: Omit<ConnectedAccount, "userId" | "stripeAccountId">): Promise<void>;
}
