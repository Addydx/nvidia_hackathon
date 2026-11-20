import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { deleteCaja } from "@/lib/caja/service";

/** «Limpiar caja»: borra las ventas y la apertura de la caja abierta del usuario. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const { deletedSales } = await deleteCaja(getRepo(), user.id, { sessionId: body?.sessionId });
    return Response.json({ deletedSales }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
