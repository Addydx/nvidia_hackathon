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
  getSale(id: string): Promise<Sale | null>;
  /** Inserta si el id no existe; si existe no hace nada. Devuelve la venta almacenada y si ya existía. */
  insertSaleOnce(sale: { id: string; sessionId: string; amountCents: number }): Promise<{ sale: Sale; duplicate: boolean }>;
}
