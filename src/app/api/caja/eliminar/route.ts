import { errorResponse, getRepo } from "@/lib/caja";
import { deleteCaja } from "@/lib/caja/service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { deletedSales } = await deleteCaja(getRepo(), { sessionId: body?.sessionId });
    return Response.json({ deletedSales }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
