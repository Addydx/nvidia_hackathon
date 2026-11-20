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
  /** Efectivo esperado: opcional (un conteo puede guardarse sin él). */
  expectedCents: number | null;
  countedCents: number;
  /** contado menos esperado: negativo = faltan, positivo = sobran. Nulo si no hay esperado. */
  differenceCents: number | null;
  closedAt: string;
};

export type CajaState = {
  session: CashSession;
  sales: Sale[];
  expectedCents: number;
};

/**
 * Todas las operaciones reciben el id del usuario autenticado (verificado por el servidor)
 * y solo ven o modifican cajas de ese usuario. Una caja ajena se trata como inexistente.
 */
export interface CajaRepo {
  getOpenSession(userId: string): Promise<CashSession | null>;
  /** Devuelve null si el usuario ya tiene una caja abierta. */
  createSession(userId: string, openingCents: number): Promise<CashSession | null>;
  /** Caja del usuario (abierta o cerrada) o null si no existe o es de otro usuario. */
  getOwnedSession(userId: string, sessionId: string): Promise<CashSession | null>;
  listSales(userId: string, sessionId: string): Promise<Sale[]>;
  /**
   * Cierra la caja del usuario en una sola transacción y calcula esperado, contado y diferencia
   * en el servidor. Si ya tenía cierre devuelve ese mismo (duplicate = true). Null si no existe.
   * Lanza HttpError 409 si la caja ya estaba cerrada sin cierre registrado.
   */
  closeSession(userId: string, sessionId: string, coins: Coins): Promise<{ closing: Closing; duplicate: boolean } | null>;
  /**
   * Limpia la caja abierta del usuario: borra sus ventas y la apertura en una sola transacción.
   * Null si no existe. Lanza HttpError 409 si la caja ya está cerrada.
   */
  deleteOpenSession(userId: string, sessionId: string): Promise<{ deletedSales: number } | null>;
  /** Último cierre confirmado del usuario (el más reciente) o null. */
  getLastClosing(userId: string): Promise<Closing | null>;
  /** Guarda un conteo SIN abrir caja (el esperado es opcional). `id` es la llave de idempotencia: un reintento devuelve el mismo. */
  saveCount(userId: string, input: { id: string; coins: Coins; expectedCents: number | null }): Promise<{ closing: Closing; duplicate: boolean }>;
  /** Indica o corrige el efectivo esperado de un conteo guardado y recalcula la diferencia. Null si no existe o no es del usuario. */
  setExpected(userId: string, closingId: string, expectedCents: number): Promise<Closing | null>;
  /** Conteos y cierres del usuario, del más reciente al más antiguo. */
  listClosings(userId: string, limit: number): Promise<Closing[]>;
  getSale(userId: string, id: string): Promise<Sale | null>;
  /** Inserta si el id no existe; si existe no hace nada. Devuelve la venta almacenada y si ya existía. */
  insertSaleOnce(userId: string, sale: { id: string; sessionId: string; amountCents: number }): Promise<{ sale: Sale; duplicate: boolean }>;
}
