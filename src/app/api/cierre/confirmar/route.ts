import { errorResponse, getRepo } from "@/lib/caja";
import { closeCaja } from "@/lib/caja/service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { closing, duplicate } = await closeCaja(getRepo(), { sessionId: body?.sessionId, coins: body?.coins });
    return Response.json({ closing, duplicate }, { status: duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
