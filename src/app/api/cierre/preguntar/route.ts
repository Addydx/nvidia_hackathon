import { adminClient, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";
import { explicar } from "@/lib/asistente";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    if (typeof body?.closingId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.closingId)) {
      return Response.json({ error: "Cierre no válido." }, { status: 400 });
    }
    const { data, error } = await adminClient().from("cash_closings")
      .select("expected_cents,counted_cents,difference_cents,cash_sessions!inner(user_id)")
      .eq("id", body.closingId).eq("cash_sessions.user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Cierre no encontrado." }, { status: 404 });
    return Response.json({ respuesta: await explicar(data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
