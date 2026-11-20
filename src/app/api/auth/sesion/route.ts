import { authClient, setSessionCookies } from "@/lib/auth";
import { errorResponse } from "@/lib/caja";

/** Canjea los tokens del enlace del correo (llegan en el #hash, solo los ve el navegador) por cookies httpOnly. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const access = typeof body?.access_token === "string" ? body.access_token : "";
    const refresh = typeof body?.refresh_token === "string" ? body.refresh_token : "";
    if (!access || !refresh) return Response.json({ error: "Enlace no válido." }, { status: 400 });
    const client = authClient();
    // Se valida con Auth: un token inventado o vencido no crea sesión.
    const { data, error } = await client.auth.getUser(access);
    if (error || !data.user) return Response.json({ error: "El enlace no es válido o ya venció." }, { status: 401 });
    const expiresIn = Number(body?.expires_in);
    await setSessionCookies({ access_token: access, refresh_token: refresh, expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
