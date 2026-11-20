import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { getState } from "@/lib/caja/service";

export async function GET() {
  await connection(); // siempre dinámico: nunca se prerenderiza ni se cachea
  try {
    const user = await requireUser();
    return Response.json({ state: await getState(getRepo(), user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
