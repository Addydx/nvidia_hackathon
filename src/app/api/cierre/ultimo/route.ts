import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, getRepo } from "@/lib/caja";
import { getLastClosing } from "@/lib/caja/service";

/** Último cierre de la cuenta (para recuperarlo al recargar o en otro dispositivo). */
export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    return Response.json({ closing: await getLastClosing(getRepo(), user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
