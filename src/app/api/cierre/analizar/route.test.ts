import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/caja/service";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: () => requireUser() }));
const { POST } = await import("./route");

// El servidor Python se simula con fetch: aquí solo se prueba el reenvío y el manejo de errores.
const photo = () => {
  const fd = new FormData();
  fd.append("foto", new File([new Uint8Array([1, 2, 3])], "m.jpg", { type: "image/jpeg" }));
  return new Request("http://x/api/cierre/analizar", { method: "POST", body: fd });
};

beforeEach(() => {
  process.env.VISION_API_URL = "http://py.test:8000";
  requireUser.mockResolvedValue({ id: "u1", email: "a@b.co" });
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.VISION_API_URL; });

describe("POST /api/cierre/analizar", () => {
  it("401 sin sesión y no llama al servicio de visión", async () => {
    requireUser.mockRejectedValue(new HttpError(401, "Inicia sesión para continuar"));
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await POST(photo());
    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
  it("reenvía la foto a /contar-monedas y devuelve el conteo", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ "1": 2, "2": 1, "5": 0, "10": 3 }));
    const res = await POST(photo());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conteo: { 1: 2, 2: 1, 5: 0, 10: 3 } });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("http://py.test:8000/contar-monedas");
    expect((init!.body as FormData).get("foto")).toBeInstanceOf(File);
  });
  it("503 si falta VISION_API_URL en producción", async () => {
    delete process.env.VISION_API_URL;
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(photo())).status).toBe(503);
    vi.unstubAllEnvs();
  });
  it("en desarrollo usa el servicio local si falta VISION_API_URL", async () => {
    delete process.env.VISION_API_URL;
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ "1": 1, "2": 0, "5": 0, "10": 0 }));
    expect((await POST(photo())).status).toBe(200);
    expect(String(spy.mock.calls[0][0])).toBe("http://127.0.0.1:8000/contar-monedas");
  });
  it("502 si Python no responde, sin filtrar la URL", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("ECONNREFUSED py.test"));
    const res = await POST(photo());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("py.test");
  });
  it("502 si Python devuelve error o JSON no interpretable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("boom", { status: 500 }));
    expect((await POST(photo())).status).toBe(502);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ hola: 1 }));
    expect((await POST(photo())).status).toBe(502);
  });
  it("400 sin foto o con archivo no imagen", async () => {
    expect((await POST(new Request("http://x", { method: "POST", body: new FormData() }))).status).toBe(400);
    const fd = new FormData();
    fd.append("foto", new File(["a"], "a.txt", { type: "text/plain" }));
    expect((await POST(new Request("http://x", { method: "POST", body: fd }))).status).toBe(400);
  });
});
