/**
 * Asistente de conteo de monedas de VendIA (lógica determinista + validación del modelo).
 *
 * Regla de diseño: el modelo NUNCA calcula importes ni inventa monedas. El código calcula subtotales y total (`hechos`), el modelo
 * solo los redacta y cada cifra de su respuesta se comprueba con `verificar`. Si el servicio no responde, la respuesta no pasa
 * la verificación o no procede del adaptador esperado, se usa un resumen determinista. Es el espejo en TypeScript de
 * asistente/vendia-monedas/monedas_lib.py (los textos coinciden literalmente; hay pruebas de paridad).
 */

export const DENOMS = [10, 5, 2, 1] as const;
export type Denom = (typeof DENOMS)[number];
export type Conteo = Record<Denom, number>;

export const ADAPTADOR_ESPERADO = "vendia-monedas-lora";
export const MODELO = "vendia-monedas";
const VALIDAS = new Set<number>([1, 2, 5, 10]);
export const MAX_MONEDAS = 99_999;

export const SYSTEM =
  "Eres el asistente de VendIA. Explicas en español el conteo de monedas mexicanas de 1, 2, 5 y 10 pesos obtenido de una " +
  "fotografía. Usa solo los hechos verificados que recibes: no calcules importes, no inventes monedas ni denominaciones y " +
  "no hables de nada que no sea este conteo. Responde en una o dos frases.";
export const ALCANCE = "Solo puedo explicar el conteo de monedas de esta foto: cuántas hay de cada denominación y cuánto suman.";
export const LIMITE = "No puedo saberlo con estos datos: solo conozco cuántas monedas de 1, 2, 5 y 10 pesos se detectaron en la foto.";

const PALABRAS: Record<number, string> = {
  0: "cero", 1: "una", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco", 6: "seis", 7: "siete", 8: "ocho", 9: "nueve", 10: "diez",
  11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince", 16: "dieciséis", 17: "diecisiete", 18: "dieciocho",
  19: "diecinueve", 20: "veinte",
};
const NUM: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11,
  doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};

/** Acepta {"1":n,"2":n,"5":n,"10":n} con enteros 0..99,999; si no, null. */
export function parseConteo(v: unknown): Conteo | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>;
  const out = {} as Conteo;
  for (const d of DENOMS) {
    const n = s[String(d)];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_MONEDAS) return null;
    out[d] = n;
  }
  return out;
}

export const palabra = (n: number) => PALABRAS[n] ?? String(n);
export const pesos = (n: number) => (n === 1 ? "1 peso" : `${n} pesos`);
export const totalPesos = (c: Conteo) => DENOMS.reduce((s, d) => s + d * c[d], 0);
export const totalMonedas = (c: Conteo) => DENOMS.reduce((s, d) => s + c[d], 0);

/** Hechos verificados que recibe el modelo; los calcula el código, no el modelo. */
export function hechos(c: Conteo, corregido = false): string {
  const l = ["Hechos verificados del conteo (calculados por la aplicación):"];
  for (const d of DENOMS) l.push(`- Monedas de ${pesos(d)}: ${c[d]} (subtotal ${pesos(d * c[d])})`);
  l.push(`- Total de monedas: ${totalMonedas(c)}`);
  l.push(`- Total: ${pesos(totalPesos(c))}`);
  if (corregido) l.push("- El usuario corrigió el conteo manualmente: sí");
  return l.join("\n");
}

/** «dos monedas de 10 pesos, una de 5, dos de 2 y una de 1» */
export function listaMonedas(c: Conteo): string {
  const partes: string[] = [];
  for (const d of DENOMS) {
    if (c[d] === 0) continue;
    partes.push(partes.length === 0 ? `${palabra(c[d])} ${c[d] === 1 ? "moneda" : "monedas"} de ${pesos(d)}` : `${palabra(c[d])} de ${d}`);
  }
  if (partes.length <= 1) return partes.join("");
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

/** Explicación automática determinista (la que se muestra y se lee en voz alta si el modelo no responde). */
export function respuestaAuto(c: Conteo, corregido = false): string {
  const t = totalPesos(c);
  if (totalMonedas(c) === 0) return corregido ? "Con tu corrección no hay monedas. El total es 0 pesos." : "No detecté monedas en la foto. El total es 0 pesos.";
  return corregido ? `Con tu corrección, el total es de ${pesos(t)}. Hay ${listaMonedas(c)}.` : `Detecté ${pesos(t)} en total. Encontré ${listaMonedas(c)}.`;
}

/** Texto corto con los importes verificados (se guarda con cada respuesta del historial). */
export const importes = (c: Conteo) => `Total: ${pesos(totalPesos(c))}. Monedas: ${totalMonedas(c)}.`;

// ----------------------------------------------------------------------------- verificación
const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}\\d])";
const rx = (s: string, f = "giu") => new RegExp(s, f);
const aNumero = (tok: string): number | null => (/^\d+$/.test(tok) ? Number(tok) : (NUM[tok.toLowerCase()] ?? null));

export function numeros(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/\d+|\p{L}+/gu)) {
    const n = aNumero(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

function permitidos(c: Conteo): Set<number> {
  const s = new Set<number>([0, 1, 2, 5, 10, totalPesos(c), totalMonedas(c)]);
  for (const d of DENOMS) { s.add(c[d]); s.add(d * c[d]); }
  return s;
}

/** Comprueba que cada cifra y cada afirmación de la respuesta coincidan con los hechos. Devuelve los motivos de rechazo. */
export function verificar(resp: string, c: Conteo, auto = false): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (!resp || resp.length > 400) return { ok: false, motivos: ["respuesta vacía o demasiado larga"] };
  if (resp.trim() === ALCANCE || resp.trim() === LIMITE || resp.startsWith("Solo puedo explicar") || resp.startsWith("No puedo saberlo")) return { ok: true, motivos };
  const ok = permitidos(c);
  for (const n of numeros(resp)) if (!ok.has(n)) motivos.push(`cifra no respaldada: ${n}`);
  const primera = rx(`${B}(\\d+|\\p{L}+)\\s+monedas?\\s+de\\s+(\\d+)${E}`);
  const cont = rx(`(?:,|${B}y)\\s+(\\d+|\\p{L}+)\\s+de\\s+(\\d+)${E}`);
  const denoms = [...resp.matchAll(rx(`${B}monedas?\\s+de\\s+(\\d+)${E}`))].map((m) => Number(m[1]));
  for (const m of resp.matchAll(cont)) denoms.push(Number(m[2]));
  for (const d of denoms) if (!VALIDAS.has(d)) motivos.push(`denominación inexistente: ${d}`);
  for (const m of [...resp.matchAll(primera), ...resp.matchAll(cont)]) {
    const n = aNumero(m[1]);
    const d = Number(m[2]);
    if (n !== null && VALIDAS.has(d) && n !== c[d as Denom]) motivos.push(`cantidad incorrecta de monedas de ${d}: ${n}`);
  }
  for (const m of resp.matchAll(rx(`${B}total\\s+(?:es\\s+)?(?:de\\s+)?(\\d+)\\s+pesos?${E}|${B}detect[ée]\\s+(\\d+)\\s+pesos?${E}`))) {
    const t = Number(m[1] ?? m[2]);
    if (t !== totalPesos(c)) motivos.push(`total incorrecto: ${t}`);
  }
  for (const m of resp.matchAll(rx("monedas\\s+de\\s+(\\d+)\\s+pesos?\\s+suman\\s+(\\d+)\\s+pesos?"))) {
    const d = Number(m[1]);
    if (VALIDAS.has(d) && Number(m[2]) !== d * c[d as Denom]) motivos.push(`subtotal incorrecto de ${d}: ${m[2]}`);
  }
  for (const m of resp.matchAll(rx(`${B}hay\\s+(\\d+|\\p{L}+)\\s+monedas?\\s+en\\s+total${E}`))) {
    if (aNumero(m[1]) !== totalMonedas(c)) motivos.push(`total de monedas incorrecto: ${m[1]}`);
  }
  if (auto) {
    if (totalMonedas(c) && !resp.includes(String(totalPesos(c)))) motivos.push("falta el total");
    for (const d of DENOMS) if (c[d] && !rx(`${B}de\\s+${d}${E}`, "iu").test(resp)) motivos.push(`falta la denominación ${d}`);
  }
  return { ok: motivos.length === 0, motivos };
}

// ----------------------------------------------------------------------------- respuesta determinista por intención
const norm = (t: string) => t.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
const DOMINIO = /moned|peso|total|cuant|suma|subtotal|conteo|detect|encontr|hay\b|denominaci|dinero|foto|resum|explica|corrig|\$/;
const LIMITES = /falsa|ano de|de que ano|danad|coleccion|origen|autentic|20 pesos|50 centavos|faltan|seguro|contaste bien|quien me pago/;

/**
 * Respuesta determinista (sin modelo) a las preguntas que se pueden resolver con los hechos. Es el respaldo verificable cuando el
 * modelo no responde. Preguntas ajenas al conteo → alcance; las que piden algo que los datos no tienen → límite.
 */
export function respuestaDeterminista(pregunta: string | null | undefined, c: Conteo, corregido = false): string {
  const q = norm(pregunta ?? "");
  if (!q) return respuestaAuto(c, corregido);
  if (LIMITES.test(q)) return LIMITE;
  if (!DOMINIO.test(q)) return ALCANCE;
  const den = [...q.matchAll(/(?<![\d.])(10|5|2|1)(?![\d])/g)].map((m) => Number(m[1]) as Denom).find((d) => DENOMS.includes(d));
  if (den !== undefined && /suman|subtotal|cuanto dinero hay en monedas|cuanto vale|cuanto son/.test(q)) {
    return c[den] === 0 ? `No hay monedas de ${pesos(den)}, así que ese subtotal es 0 pesos.` : `Las monedas de ${pesos(den)} suman ${pesos(den * c[den])}.`;
  }
  if (den !== undefined && /cuantas|hay monedas|cuantos|encontraste/.test(q)) {
    return c[den] === 0 ? `No encontré monedas de ${pesos(den)}.` : `Encontré ${palabra(c[den])} ${c[den] === 1 ? "moneda" : "monedas"} de ${pesos(den)}.`;
  }
  if (/cuantas monedas|cuantas son|numero de monedas/.test(q)) {
    const n = totalMonedas(c);
    return n === 0 ? "No detecté ninguna moneda." : `Hay ${n} ${n === 1 ? "moneda" : "monedas"} en total.`;
  }
  if (/total|cuanto dinero hay\b|cuantos pesos|a cuanto suma/.test(q) && !/que monedas/.test(q)) {
    return totalMonedas(c) === 0 ? "No detecté monedas, así que el total es 0 pesos." : `El total es de ${pesos(totalPesos(c))}.`;
  }
  return respuestaAuto(c, corregido);
}

// ----------------------------------------------------------------------------- explicación (modelo + verificación)
export type RespuestaAsistente = {
  origen: "modelo" | "resumen";
  respuesta: string;
  importes: string;
  /** Solo en el modo «resumen»: por qué no se usó el modelo (para mostrar un aviso claro). */
  aviso?: string;
};

type Entorno = { url?: string; key?: string; fetch?: typeof fetch };

/**
 * Explica el conteo. Con servicio configurado envía al modelo SOLO los hechos verificados y la pregunta; acepta su texto únicamente
 * si procede del adaptador esperado y pasa `verificar`. En cualquier otro caso (sin servicio, error de red, tiempo agotado,
 * adaptador distinto, cifras que no cuadran) devuelve el resumen determinista con un aviso.
 */
export async function explicar(c: Conteo, pregunta: string | null, corregido = false, env: Entorno = {}): Promise<RespuestaAsistente> {
  const url = env.url ?? process.env.CIERRE_CHAT_URL;
  const key = env.key ?? process.env.CIERRE_CHAT_KEY;
  const esAuto = !pregunta || !pregunta.trim();
  const respaldo = (aviso?: string): RespuestaAsistente => ({ origen: "resumen", respuesta: respuestaDeterminista(pregunta, c, corregido), importes: importes(c), ...(aviso && { aviso }) });
  if (!url) return respaldo();
  try {
    const res = await (env.fetch ?? fetch)(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", ...(key && { Authorization: "Bearer " + key }) },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 110,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${hechos(c, corregido)}\nPregunta: ${esAuto ? "Explica el conteo." : pregunta!.trim()}` },
        ],
      }),
    });
    if (!res.ok) return respaldo("El servicio del modelo respondió con un error.");
    const data = await res.json();
    const texto = data?.choices?.[0]?.message?.content;
    if (data?.adapter !== ADAPTADOR_ESPERADO) return respaldo("La respuesta no procede del adaptador esperado.");
    if (typeof texto !== "string" || !texto.trim()) return respaldo("El modelo no devolvió texto.");
    const ver = verificar(texto.trim(), c, esAuto);
    if (!ver.ok) return respaldo("Las cifras del modelo no coinciden con el conteo; se muestra un resumen verificable.");
    return { origen: "modelo", respuesta: texto.trim(), importes: importes(c) };
  } catch {
    return respaldo("No hay conexión con el servicio del modelo.");
  }
}
