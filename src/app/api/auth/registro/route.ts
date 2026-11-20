import { appUrl, authClient, authMessage, parseEmail, parsePassword, setSessionCookies } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = parseEmail(body?.email);
    const password = parsePassword(body?.password);
    if (!email) return Response.json({ error: "Escribe un correo válido." }, { status: 400 });
    if (!password) return Response.json({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, { status: 400 });
    const { data, error } = await authClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${appUrl(request)}/acceso?confirmado=1` },
    });
    if (error) {
      const m = authMessage(error);
      return Response.json({ error: m.message }, { status: m.status });
    }
    // Con confirmación por correo activa no hay sesión todavía; sin ella, se entra directo.
    if (data.session) {
      await setSessionCookies(data.session);
      return Response.json({ ok: true, entered: true });
    }
    return Response.json({ ok: true, entered: false });
  } catch (e) {
    return errorResponse(e);
  }
}
