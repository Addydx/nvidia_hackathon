export const MAX_CENTS = 99_999_999; // $999,999.99

/** Convierte texto como "10", "10.5" o "10,50" a centavos enteros, sin usar floats. */
export function parsePesosToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const m = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  return cents <= MAX_CENTS ? cents : null;
}

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatCents(cents: number): string {
  return mxn.format(cents / 100);
}
