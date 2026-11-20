export type CashSession = {
  id: string;
  openingCents: number;
  openedAt: string;
};

export type Sale = {
  id: string;
  sessionId: string;
  amountCents: number;
  createdAt: string;
};

export type Coins = Record<1 | 2 | 5 | 10, number>;

export type Closing = {
  id: string;
  sessionId: string;
  coins: Coins;
  expectedCents: number;
  countedCents: number;
  /** contado menos esperado: negativo = faltan, positivo = sobran */
  differenceCents: number;
  closedAt: string;
};

export type CajaState = {
  session: CashSession;
  sales: Sale[];
  expectedCents: number;
};

export interface CajaRepo {
  getOpenSession(): Promise<CashSession | null>;
  /** Devuelve null si ya hay una caja abierta. */
  createSession(openingCents: number): Promise<CashSession | null>;
  listSales(sessionId: string): Promise<Sale[]>;
  /**
   * Cierra la caja en una sola transacción y calcula esperado, contado y diferencia en el servidor.
   * Si la caja ya tenía cierre devuelve ese mismo (duplicate = true). Null si la caja no existe.
   * Lanza HttpError 409 si la caja ya estaba cerrada sin cierre registrado.
   */
  closeSession(sessionId: string, coins: Coins): Promise<{ closing: Closing; duplicate: boolean } | null>;
  /**
   * Borra la caja abierta y sus ventas en una sola transacción. Null si la caja no existe.
   * Lanza HttpError 409 si la caja ya está cerrada.
   */
  deleteOpenSession(sessionId: string): Promise<{ deletedSales: number } | null>;
  getSale(id: string): Promise<Sale | null>;
  /** Inserta si el id no existe; si existe no hace nada. Devuelve la venta almacenada y si ya existía. */
  insertSaleOnce(sale: { id: string; sessionId: string; amountCents: number }): Promise<{ sale: Sale; duplicate: boolean }>;
}
