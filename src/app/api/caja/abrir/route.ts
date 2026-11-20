import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { openCaja } from "@/lib/caja/service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    return Response.json({ state: await openCaja(getRepo(), user.id, body?.openingCents) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
