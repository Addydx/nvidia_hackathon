import { HttpError } from "./caja/service";

const hits = new Map<string, { n: number; reset: number }>();

/** Límite sencillo por IP (ventana fija, en memoria del proceso) para rutas abiertas a invitados que gastan CPU. */
export function rateLimit(request: Request, name: string, max: number, windowMs = 60_000) {
  const h = request.headers;
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${name}:${ip}`;
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const e = hits.get(key);
  if (!e || e.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return;
  }
  if (++e.n > max) throw new HttpError(429, "Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.");
}
