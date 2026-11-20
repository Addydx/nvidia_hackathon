import { appUrl, authClient, authMessage, parseEmail } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = parseEmail(body?.email);
    if (!email) return Response.json({ error: "Escribe un correo válido." }, { status: 400 });
    const { error } = await authClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl(request)}/cambiar-contrasena`,
    });
    // Misma respuesta exista o no la cuenta: no se revela qué correos están registrados.
    if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
      const m = authMessage(error);
      return Response.json({ error: m.message }, { status: m.status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
