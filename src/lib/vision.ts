export const DENOMINATIONS = [1, 2, 5, 10] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
export type CoinCount = Record<Denomination, number>;

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const WRAPPERS = ["conteo", "conteos", "monedas", "counts", "resultado", "result"];

/**
 * Normaliza la respuesta de POST /contar-monedas. Acepta las cantidades en la raíz
 * o dentro de un objeto envolvente, con llaves como "1", "$1", "peso_1" o "m1"
 * (se toma el número de la llave). Exige las cuatro denominaciones con enteros >= 0;
 * si no, devuelve null para no mostrar un conteo inventado.
 */
export function parseConteo(json: unknown): CoinCount | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const wrapped = WRAPPERS.map((k) => root[k]).find((v) => v && typeof v === "object" && !Array.isArray(v));
  const source = (wrapped ?? root) as Record<string, unknown>;
  const out: Partial<CoinCount> = {};
  for (const [key, value] of Object.entries(source)) {
    const digits = /^\D*(\d+)\D*$/.exec(key)?.[1];
    if (!digits) continue;
    const d = Number(digits);
    if (!(DENOMINATIONS as readonly number[]).includes(d)) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
    out[d as Denomination] = value;
  }
  return DENOMINATIONS.every((d) => out[d] !== undefined) ? (out as CoinCount) : null;
}

/** Valor en pesos de las monedas contadas de una denominación. */
export const subtotal = (conteo: CoinCount, d: Denomination): number => d * conteo[d];

/** Suma total en pesos de todas las monedas contadas. */
export const totalPesos = (conteo: CoinCount): number => DENOMINATIONS.reduce((sum, d) => sum + subtotal(conteo, d), 0);
