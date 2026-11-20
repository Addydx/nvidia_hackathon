import { authClient, authMessage, parseEmail, setSessionCookies } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = parseEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return Response.json({ error: "Escribe tu correo y tu contraseña." }, { status: 400 });
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const m = authMessage(error);
      return Response.json({ error: m.message }, { status: m.status });
    }
    await setSessionCookies(data.session);
    return Response.json({ ok: true, email: data.session.user.email });
  } catch (e) {
    return errorResponse(e);
  }
}
