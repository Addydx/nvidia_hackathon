import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { listHistory, saveCount } from "@/lib/caja/service";

/** Historial de conteos de la cuenta, del más reciente al más antiguo. */
export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    return Response.json({ closings: await listHistory(getRepo(), user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Guarda un conteo en la cuenta, sin abrir caja. `id` es la llave de idempotencia: un reintento devuelve el mismo conteo. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const { closing, duplicate } = await saveCount(getRepo(), user.id, { id: body?.id, coins: body?.coins, expectedCents: body?.expectedCents });
    return Response.json({ closing, duplicate }, { status: duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
