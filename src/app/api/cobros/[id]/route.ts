import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, getDeps } from "@/lib/cobros";
import { getCharge } from "@/lib/cobros/service";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const payment = await getCharge(getDeps(request), user.id, id);
    // Un cobro ajeno responde igual que uno inexistente.
    if (!payment) return Response.json({ error: "Cobro no encontrado" }, { status: 404 });
    return Response.json({ payment }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
