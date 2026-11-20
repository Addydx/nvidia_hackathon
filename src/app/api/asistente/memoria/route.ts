import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";
import { listMemory } from "@/lib/caja/memoria-repo";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Memoria del asistente de la cuenta para un cierre. Solo cuentas: los invitados la guardan en su pestaña. */
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const closingId = new URL(request.url).searchParams.get("closingId") ?? "";
    if (!UUID.test(closingId)) return Response.json({ error: "Cierre no válido." }, { status: 400 });
    return Response.json({ items: await listMemory(user.token, closingId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
