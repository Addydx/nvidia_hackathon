import { getUser, userClient } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";
import { HttpError } from "@/lib/caja/service";
import { addMemory } from "@/lib/caja/memoria-repo";
import { explicar } from "@/lib/asistente";
import { MAX_CENTS } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const cents = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTS;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const pregunta: string = typeof body?.pregunta === "string" ? body.pregunta.trim() : "";
    if (!pregunta || pregunta.length > 240 || Array.from(pregunta).some(char => char.charCodeAt(0) < 32)) {
      return Response.json({ error: "Escribe una pregunta de hasta 240 caracteres en una línea." }, { status: 400 });
    }
    const user = await getUser();

    // INVITADO: no hay cierre en el servidor. Se explican los importes que manda la pestaña (el servidor recalcula la
    // diferencia) y no se guarda nada: no existe ningún historial compartido entre invitados.
    if (!user) {
      const i = body?.importes;
      if (!cents(i?.expectedCents) || !cents(i?.countedCents)) {
        throw new HttpError(401, "Inicia sesión para consultar un cierre guardado en tu cuenta.");
      }
      rateLimit(request, "preguntar-invitado", 20);
      const answer = await explicar(
        { expected_cents: i.expectedCents, counted_cents: i.countedCents, difference_cents: i.countedCents - i.expectedCents },
        pregunta,
      );
      return Response.json(answer, { headers: { "Cache-Control": "no-store" } });
    }

    // CUENTA: el cierre se lee con el token del usuario (RLS) y además se filtra por su user_id.
    if (typeof body?.closingId !== "string" || !UUID.test(body.closingId)) {
      return Response.json({ error: "Cierre no válido." }, { status: 400 });
    }
    const db = userClient(user.token);
    const { data, error } = await db.from("cash_closings")
      .select("expected_cents,counted_cents,difference_cents,cash_sessions!inner(user_id)")
      .eq("id", body.closingId).eq("cash_sessions.user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Cierre no encontrado." }, { status: 404 });
    const answer = await explicar(data, pregunta);
    // La conversación queda en la memoria de la cuenta (Supabase, asociada a su user_id). Si no se pudiera guardar,
    // la respuesta se entrega igual y se avisa.
    let saved = null;
    try {
      saved = await addMemory(user.token, user.id, body.closingId, {
        question: pregunta, answer: answer.respuesta, origin: answer.origen, amounts: answer.importes,
      });
    } catch (e) {
      console.error("memoria del asistente", e);
    }
    return Response.json({ ...answer, memory: saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
