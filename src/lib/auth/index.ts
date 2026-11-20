import { cookies } from "next/headers";
import { createClient, type Session } from "@supabase/supabase-js";
import { HttpError } from "../caja/service";

export type AuthUser = { id: string; email: string; token: string };

const ACCESS = "cc-at";
const REFRESH = "cc-rt";
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

/**
 * Cliente de Auth del servidor. Usa la clave pública (anon/publishable) del proyecto:
 * nunca la service role para operaciones de usuario. Sin sesión persistente: las
 * sesiones viven en cookies httpOnly que gestiona este módulo.
 */
export function authClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(503, "Las cuentas no están configuradas (SUPABASE_URL / SUPABASE_ANON_KEY)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Cliente con service role, solo para operaciones de administración (cambiar contraseña, cerrar sesión). */
export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, "Supabase no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/** Guarda la sesión en cookies httpOnly. Solo desde Route Handlers. */
export async function setSessionCookies(session: Pick<Session, "access_token" | "refresh_token" | "expires_in">) {
  const jar = await cookies();
  jar.set(ACCESS, session.access_token, { ...cookieBase(), maxAge: Math.max(60, session.expires_in ?? 3600) });
  jar.set(REFRESH, session.refresh_token, { ...cookieBase(), maxAge: REFRESH_MAX_AGE });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

/**
 * Usuario de la petición, verificado contra Supabase Auth en cada llamada (getUser valida la firma y la
 * vigencia del token en el servidor de Auth; no se confía en el contenido de la cookie). Si el token de
 * acceso venció, lo renueva con el de refresco y reescribe las cookies. Devuelve null sin sesión válida.
 */
export async function getUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS)?.value;
  const refresh = jar.get(REFRESH)?.value;
  const client = authClient();

  if (access) {
    const { data } = await client.auth.getUser(access);
    if (data.user?.email) return { id: data.user.id, email: data.user.email, token: access };
  }
  if (refresh) {
    const { data, error } = await client.auth.refreshSession({ refresh_token: refresh });
    if (!error && data.session?.user.email) {
      await setSessionCookies(data.session);
      return { id: data.session.user.id, email: data.session.user.email, token: data.session.access_token };
    }
  }
  if (access || refresh) await clearSessionCookies();
  return null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new HttpError(401, "Inicia sesión para continuar");
  return user;
}

/** URL pública de la app (para los enlaces de los correos). APP_URL manda; si no, la de la petición. */
export function appUrl(request: Request): string {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const parseEmail = (v: unknown): string | null =>
  typeof v === "string" && EMAIL.test(v.trim()) && v.trim().length <= 254 ? v.trim().toLowerCase() : null;
export const parsePassword = (v: unknown): string | null =>
  typeof v === "string" && v.length >= 8 && v.length <= 72 ? v : null;

/** Traduce errores de Supabase Auth a mensajes claros, sin revelar si un correo existe. */
export function authMessage(error: { message?: string; code?: string; status?: number } | null | undefined): { status: number; message: string } {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login")) return { status: 401, message: "Correo o contraseña incorrectos." };
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return { status: 403, message: "Confirma tu correo con el enlace que te enviamos antes de entrar." };
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error?.status === 429)
    return { status: 429, message: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." };
  if (code === "weak_password") return { status: 400, message: "La contraseña es muy débil. Usa al menos 8 caracteres, con letras y números." };
  if (code === "same_password") return { status: 400, message: "Elige una contraseña distinta a la anterior." };
  if (code === "user_already_exists" || msg.includes("already registered"))
    return { status: 409, message: "Ese correo ya tiene una cuenta. Inicia sesión." };
  if (code === "signup_disabled") return { status: 403, message: "El registro está desactivado en este momento." };
  return { status: 500, message: "No se pudo completar la operación. Inténtalo de nuevo." };
}

/**
 * Cliente de Supabase que actúa COMO el usuario (su access token): las políticas de acceso (RLS) de la base se
 * aplican de verdad con auth.uid(). Se usa para la memoria del asistente: aunque el servidor tuviera un error,
 * la base no entrega ni acepta filas de otro usuario.
 */
export function userClient(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError(503, "Las cuentas no están configuradas (SUPABASE_URL / SUPABASE_ANON_KEY)");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
