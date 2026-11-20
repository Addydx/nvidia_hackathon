import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { setExpected } from "@/lib/caja/service";

/** Indica o corrige el efectivo esperado de un conteo guardado; el servidor recalcula la diferencia. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const closing = await setExpected(getRepo(), user.id, { closingId: body?.closingId, expectedCents: body?.expectedCents });
    return Response.json({ closing }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
