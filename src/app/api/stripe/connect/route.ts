import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, getDeps } from "@/lib/cobros";
import { getConnectStatus, startConnectOnboarding } from "@/lib/cobros/service";

/** Estado de la cuenta conectada del usuario (consulta a Stripe al volver del onboarding con ?refresh=1). */
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return Response.json({ connect: await getConnectStatus(getDeps(request), user.id, refresh) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Crea la cuenta conectada y devuelve el enlace de onboarding alojado por Stripe. Desactivado hasta STRIPE_CONNECT_ENABLED=true. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    return Response.json(await startConnectOnboarding(getDeps(request), user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
