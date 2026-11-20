import { createLocalRepo } from "./local-repo";
import { closeCaja, deleteCaja, getLastClosing, getState, HttpError, openCaja, registerSale } from "./service";

export type Profile = { mode: "guest" } | { mode: "user"; id: string; email: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
export type Api = <T>(path: string, init?: { method?: string; body?: string }) => Promise<ApiResult<T>>;

/** Clave para separar lo guardado en el navegador (venta pendiente, memoria) por perfil. */
export const profileKey = (p: Profile) => (p.mode === "user" ? `u:${p.id}` : "guest");

const GUEST = "guest";

/** Cuentas: la API del servidor (sesión en cookie httpOnly; el servidor limita todo al usuario). */
const remote: Api = async (path, init) => {
  try {
    const res = await fetch(path, {
      method: init?.method,
      body: init?.body,
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) window.location.reload(); // sesión vencida: al recargar se pasa a invitado
    if (res.ok) return { ok: true, data: body };
    return { ok: false, status: res.status, error: body?.error ?? "No se pudo completar la operación" };
  } catch {
    return { ok: false, status: 0, error: "Sin conexión con el servidor" };
  }
};

/** Invitado: las mismas operaciones, ejecutadas en el navegador contra sessionStorage. Nada sale del dispositivo. */
function guestApi(): Api {
  const repo = createLocalRepo(window.sessionStorage);
  return async (path, init) => {
    const method = init?.method ?? "GET";
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(init.body) : {};
    } catch {
      /* cuerpo vacío */
    }
    try {
      switch (`${method} ${path}`) {
        case "GET /api/caja":
          return { ok: true, data: { state: await getState(repo, GUEST) } as never };
        case "POST /api/caja/abrir":
          return { ok: true, data: { state: await openCaja(repo, GUEST, body.openingCents) } as never };
        case "POST /api/caja/ventas": {
          const { sale, duplicate, state } = await registerSale(repo, GUEST, body as never);
          return { ok: true, data: { sale, duplicate, state } as never };
        }
        case "POST /api/caja/limpiar":
          return { ok: true, data: (await deleteCaja(repo, GUEST, { sessionId: body.sessionId })) as never };
        case "POST /api/cierre/confirmar": {
          const { closing, duplicate } = await closeCaja(repo, GUEST, { sessionId: body.sessionId, coins: body.coins });
          return { ok: true, data: { closing, duplicate } as never };
        }
        case "GET /api/cierre/ultimo":
          return { ok: true, data: { closing: await getLastClosing(repo, GUEST) } as never };
        default:
          return { ok: false, status: 404, error: "Operación no disponible para invitados" };
      }
    } catch (e) {
      if (e instanceof HttpError) return { ok: false, status: e.status, error: e.message };
      return { ok: false, status: 500, error: "No se pudo completar la operación" };
    }
  };
}

export function createApi(profile: Profile): Api {
  return profile.mode === "user" ? remote : guestApi();
}
