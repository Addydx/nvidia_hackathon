import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { registerSale } from "@/lib/caja/service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const { sale, duplicate, state } = await registerSale(getRepo(), user.id, body ?? {});
    return Response.json({ sale, duplicate, state }, { status: duplicate ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
