import { errorResponse, getRepo } from "@/lib/caja";
import { registerSale } from "@/lib/caja/service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sale, duplicate, state } = await registerSale(getRepo(), body ?? {});
    return Response.json({ sale, duplicate, state }, { status: duplicate ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
