type Amounts = {
  expected_cents: number | null;
  counted_cents: number | null;
  difference_cents: number | null;
};

function money(cents: number | null) {
  if (cents === null) return "sin dato";
  const n = Math.abs(cents);
  const fraction = n % 100 ? "." + String(n % 100).padStart(2, "0") : "";
  return (cents < 0 ? "-$" : "$") + Math.floor(n / 100) + fraction + " MXN";
}

export async function explicar(row: Amounts) {
  const missing = [];
  if (!Number.isSafeInteger(row.expected_cents)) missing.push("esperado");
  if (!Number.isSafeInteger(row.counted_cents)) missing.push("contado");
  if (missing.length) return "Necesito el efectivo " + missing.join(" y ") + " para explicar el cierre.";
  const d = row.difference_cents;
  if (d === null || !Number.isSafeInteger(d)) return "Necesito la diferencia calculada por Caja para explicar el cierre.";
  const result = d === 0 ? "La caja cuadra. La diferencia es $0 MXN." :
    (d < 0 ? "Faltan " : "Sobran ") + money(Math.abs(d)) + ". Con los datos del cierre no puedo determinar la causa.";
  const url = process.env.CIERRE_CHAT_URL;
  if (!url) return result;
  try {
    const response = await fetch(url, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CIERRE_CHAT_KEY && { Authorization: "Bearer " + process.env.CIERRE_CHAT_KEY }),
      },
      body: JSON.stringify({
        model: "corte-lora", temperature: 0, max_tokens: 64,
        messages: [
          { role: "system", content: "Explica el cierre en español. Usa la diferencia calculada, en MXN. Si faltan datos, pídelos. No atribuyas causas." },
          { role: "user", content: `Esperado: ${money(row.expected_cents)}. Contado: ${money(row.counted_cents)}. Diferencia: ${money(d)}. ¿Qué pasó y por qué?` },
        ],
      }),
    });
    if (response.ok) {
      const answer = (await response.json()).choices?.[0]?.message?.content;
      // Solo se publica texto comprobado contra los datos guardados.
      if (typeof answer === "string" && answer.trim() === result) return answer.trim();
    }
  } catch {
    // El cierre guardado permite responder incluso si la GPU está desconectada.
  }
  return result;
}
