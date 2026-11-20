import { connection } from "next/server";
import { errorResponse, getRepo } from "@/lib/caja";
import { getState } from "@/lib/caja/service";

export async function GET() {
  await connection(); // siempre dinámico: nunca se prerenderiza ni se cachea
  try {
    return Response.json({ state: await getState(getRepo()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
