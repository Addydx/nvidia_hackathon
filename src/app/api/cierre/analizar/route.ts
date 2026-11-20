import { MAX_PHOTO_BYTES, parseConteo } from "@/lib/vision";

const TIMEOUT_MS = 60_000;

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  // En desarrollo, si falta VISION_API_URL se usa el servicio local; en producción es obligatoria.
  const base = process.env.VISION_API_URL || (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:8000" : undefined);
  if (!base) return fail(503, "El servicio de visión no está configurado (falta VISION_API_URL en el servidor).");

  let foto: FormDataEntryValue | null;
  try {
    foto = (await request.formData()).get("foto");
  } catch {
    return fail(400, "La solicitud debe ser multipart/form-data con el campo «foto».");
  }
  if (!(foto instanceof File) || foto.size === 0) return fail(400, "Falta la foto.");
  if (!foto.type.startsWith("image/")) return fail(400, "El archivo debe ser una imagen.");
  if (foto.size > MAX_PHOTO_BYTES) return fail(413, "La foto pesa más de 10 MB.");

  const body = new FormData();
  body.append("foto", foto, foto.name || "foto.jpg");

  let res: Response;
  try {
    res = await fetch(new URL("/contar-monedas", base), {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return fail(502, "No se pudo conectar con el servicio de visión.");
  }
  if (!res.ok) return fail(502, `El servicio de visión respondió con error (${res.status}).`);

  const json: unknown = await res.json().catch(() => null);
  const conteo = parseConteo(json);
  if (!conteo) return fail(502, "El servicio de visión devolvió una respuesta que no se pudo interpretar.");
  return Response.json({ conteo }, { headers: { "Cache-Control": "no-store" } });
}
