import { adminClient, authMessage, parsePassword, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const password = parsePassword(body?.password);
    if (!password) return Response.json({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, { status: 400 });
    const { error } = await adminClient().auth.admin.updateUserById(user.id, { password });
    if (error) {
      const m = authMessage(error);
      return Response.json({ error: m.message }, { status: m.status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
