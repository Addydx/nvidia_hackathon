type Amounts = {
  expected_cents: number | null;
  counted_cents: number | null;
  difference_cents: number | null;
};

function money(cents: number | null) {
  if (cents === null || !Number.isSafeInteger(cents)) return "sin dato";
  const n = Math.abs(cents);
  const fraction = n % 100 ? "." + String(n % 100).padStart(2, "0") : "";
  return (cents < 0 ? "-$" : "$") + Math.floor(n / 100) + fraction + " MXN";
}

export type ClosingAnswer = { origen: "modelo" | "resumen"; respuesta: string; importes: string };

const scope = "Puedo explicar el efectivo esperado, el contado y la diferencia de este cierre.";
const cause = "Con los datos del cierre no puedo determinar la causa.";

function normalize(text: string) {
  return text.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ").trim();
}

// Una variante con una cifra solo se acepta si la frase completa vincula esa
// cifra al concepto correcto. Rechazar una frase dudosa conserva el resumen.
function equivalente(sentence: string, row: Amounts) {
  const text = sentence.replace(/[.!]$/, "");
  const amount = /([+-]?)\$(\d+)(?:[.,](\d{1,2}))?(?: mxn| pesos)?$/.exec(text);
  if (!amount) return null;
  const cents = (Number(amount[2]) * 100 + Number((amount[3] ?? "").padEnd(2, "0"))) *
    (amount[1] === "-" ? -1 : 1);
  const subject = text.slice(0, amount.index).trim();
  if (/^(?:el (?:efectivo|importe) esperado (?:es|era|fue|fue de)|se esperaban)$/.test(subject)
    && cents === row.expected_cents) return "esperado";
  if (/^(?:el (?:efectivo|importe) contado (?:es|era|fue|fue de)|se contaron|contaste)$/.test(subject)
    && cents === row.counted_cents) return "contado";
  if (/^(?:faltan|faltaron|hay un faltante de)$/.test(subject)
    && cents > 0 && -cents === row.difference_cents) return "resultado";
  if (/^(?:sobran|sobraron|hay un sobrante de)$/.test(subject)
    && cents > 0 && cents === row.difference_cents) return "resultado";
  if (/^la diferencia (?:es|fue|fue de)$/.test(subject) && cents === row.difference_cents) return "resultado";
  return null;
}

// Se validan afirmaciones individuales. Qwen puede seleccionar y combinar las
// pertinentes, pero cada importe queda vinculado a su concepto y cada comparación a su signo.
export async function explicar(row: Amounts, question: string): Promise<ClosingAnswer> {
  const { expected_cents: e, counted_cents: c, difference_cents: d } = row;
  const signed = d !== null && d > 0 ? "+" + money(d) : money(d);
  const importes = `Esperado: ${money(e)}. Contado: ${money(c)}. Diferencia: ${signed}.`;
  const summary = (respuesta: string): ClosingAnswer => ({ origen: "resumen", respuesta, importes });
  const missing = [];
  if (!Number.isSafeInteger(e)) missing.push("esperado");
  if (!Number.isSafeInteger(c)) missing.push("contado");
  if (missing.length) return summary("Necesito el efectivo " + missing.join(" y ") + " para explicar el cierre.");
  if (d === null || !Number.isSafeInteger(d)) return summary("Necesito la diferencia calculada por Caja para explicar el cierre.");

  const comparison = d < 0 ? "Se contó menos efectivo del esperado." :
    d > 0 ? "Se contó más efectivo del esperado." : "El efectivo contado coincide con el esperado.";
  const balance = d === 0 ? "La caja cuadra." : (d < 0 ? "Faltan " : "Sobran ") + money(Math.abs(d)) + ".";
  const expected = "El efectivo esperado era " + money(e) + ".";
  const counted = "Se contaron " + money(c) + ".";
  const formula = "La diferencia se obtiene al restar el efectivo esperado al contado.";
  const difference = "La diferencia es " + money(d) + ".";
  const facts = new Map([
    [balance, "resultado"], [comparison, "resultado"], [difference, "resultado"],
    [expected, "esperado"], [counted, "contado"], [formula, "formula"],
    [cause, "causa"], [scope, "alcance"],
  ]);
  const q = normalize(question);
  const aboutClosing = /cierre|caja|efectivo|dinero|diferencia|cuadr|sobr|falt|conta|conte\b|espera|saldo|importe|perdi|venta|pago/.test(q) ||
    /^[¿ ]*(?:que paso(?: y por que)?|por que|cual es la causa|como se calcul[ao])[? .!]*$/.test(q);
  const fallback = summary(aboutClosing ? balance + " " + cause : scope);
  const url = process.env.CIERRE_CHAT_URL;
  if (!url) return fallback;
  const allowed = aboutClosing ? Array.from(facts.keys()) : [scope];
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CIERRE_CHAT_KEY && { Authorization: "Bearer " + process.env.CIERRE_CHAT_KEY }),
      },
      body: JSON.stringify({
        model: "corte-lora", temperature: 0, max_tokens: 96,
        messages: [
          { role: "system", content: "Responde la pregunta en español. Explica en una o dos frases usando solo los hechos verificados que respondan a la pregunta. Si es ajena al cierre, indica el alcance. Hechos y alcance:\n" + allowed.join("\n") },
          { role: "user", content: importes + "\nPregunta: " + question },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const answer = (await response.json()).choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim() || answer.length > 500) return fallback;
    const sentences = answer.trim().split(/(?<=[.!?])\s+/u).map(normalize);
    const verified = new Map(Array.from(facts, ([phrase, topic]) => [normalize(phrase), topic]));
    const topics = sentences.map(s => verified.get(s) ?? equivalente(s, row));
    if (topics.length > 3 || topics.some(topic => !topic)) return fallback;
    if (topics.includes("alcance") && topics.length > 1) return fallback;
    if (!aboutClosing && topics.some(topic => topic !== "alcance")) return fallback;
    const needs = [
      [/por que|causa|motivo|se perdio|error de cambio/, "causa"],
      [/cuanto.*esper|cual.*esper/, "esperado"],
      [/cuanto.*cont|cuanto conte/, "contado"],
      [/como.*calcul|como.*obti|como.*rest/, "formula"],
    ] as const;
    if (aboutClosing && needs.some(([pattern, topic]) => pattern.test(q) && !topics.includes(topic))) return fallback;
    return { origen: "modelo", respuesta: answer.trim(), importes };
  } catch {
    return fallback;
  }
}
