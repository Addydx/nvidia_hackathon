import { getUser, userClient } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";
import { addMemory } from "@/lib/caja/memoria-repo";
import { HttpError } from "@/lib/caja/service";
import { explicar, importes, parseConteo, totalPesos, type Conteo } from "@/lib/monedas-asistente";
import { rateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Asistente de conteo de monedas. Recibe el conteo verificado de la foto (o el id de un conteo guardado) y, opcionalmente, una
 * pregunta; sin pregunta genera la explicación automática. Los importes los calcula el servidor con código: el cliente solo aporta
 * las cantidades por denominación, nunca totales ni subtotales. Cuenta + conteo guardado → el conteo se lee de la base con el token
 * del usuario (RLS) y la conversación queda en su memoria. Invitado o conteo sin guardar → no se guarda nada en el servidor.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const preguntaRaw = body?.pregunta;
    let pregunta: string | null = null;
    if (preguntaRaw !== undefined && preguntaRaw !== null) {
      const p = typeof preguntaRaw === "string" ? preguntaRaw.trim() : "";
      if (!p || p.length > 240 || Array.from(p).some((ch) => ch.charCodeAt(0) < 32)) {
        return Response.json({ error: "Escribe una pregunta de hasta 240 caracteres en una línea." }, { status: 400 });
      }
      pregunta = p;
    }
    const corregido = body?.corregido === true;
    const user = await getUser();

    let conteo: Conteo | null = null;
    let closingId: string | null = null;
    if (typeof body?.closingId === "string") {
      if (!user) throw new HttpError(401, "Inicia sesión para consultar un conteo guardado en tu cuenta.");
      if (!UUID.test(body.closingId)) return Response.json({ error: "Conteo no válido." }, { status: 400 });
      const { data, error } = await userClient(user.token)
        .from("cash_closings")
        .select("coins_1,coins_2,coins_5,coins_10,cash_sessions!inner(user_id)")
        .eq("id", body.closingId)
        .eq("cash_sessions.user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "Conteo no encontrado." }, { status: 404 });
      conteo = { 1: data.coins_1, 2: data.coins_2, 5: data.coins_5, 10: data.coins_10 };
      closingId = body.closingId;
    } else {
      conteo = parseConteo(body?.conteo);
      if (!conteo) return Response.json({ error: "Conteo no válido." }, { status: 400 });
      rateLimit(request, "asistente-conteo", 30); // abierto a invitados y a conteos sin guardar: se limita por IP
    }

    const r = await explicar(conteo, pregunta, corregido);
    let memory = null;
    if (user && closingId && pregunta) {
      try {
        memory = await addMemory(user.token, user.id, closingId, { question: pregunta, answer: r.respuesta, origin: r.origen, amounts: importes(conteo) });
      } catch (e) {
        console.error("memoria del asistente", e); // la respuesta se entrega igual
      }
    }
    return Response.json({ ...r, conteo, total_mxn: totalPesos(conteo), memory }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
