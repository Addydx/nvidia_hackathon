import { createMemoryRepo } from "./memory-repo";
import { createSupabaseRepo } from "./supabase-repo";
import { HttpError } from "./service";
import type { CajaRepo } from "./types";

const g = globalThis as unknown as { __cajaMemoryRepo?: CajaRepo };

export function getRepo(): CajaRepo {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return createSupabaseRepo(url, key);
  // Modo local sin Supabase: nunca en producción.
  if (process.env.CAJA_STORE === "memory" && process.env.NODE_ENV !== "production") {
    return (g.__cajaMemoryRepo ??= createMemoryRepo());
  }
  throw new HttpError(503, "Supabase no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

/** Convierte errores en respuestas JSON sin filtrar detalles internos. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Error del servidor" }, { status: 500 });
}
