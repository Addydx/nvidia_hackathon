import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// El servidor Python se simula con fetch: aquí solo se prueba el reenvío y el manejo de errores.
const photo = () => {
  const fd = new FormData();
  fd.append("foto", new File([new Uint8Array([1, 2, 3])], "m.jpg", { type: "image/jpeg" }));
  return new Request("http://x/api/cierre/analizar", { method: "POST", body: fd });
};

beforeEach(() => { process.env.VISION_API_URL = "http://py.test:8000"; });
afterEach(() => { vi.restoreAllMocks(); delete process.env.VISION_API_URL; });

describe("POST /api/cierre/analizar", () => {
  it("reenvía la foto a /contar-monedas y devuelve el conteo", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ "1": 2, "2": 1, "5": 0, "10": 3 }));
    const res = await POST(photo());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conteo: { 1: 2, 2: 1, 5: 0, 10: 3 } });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe("http://py.test:8000/contar-monedas");
    expect((init!.body as FormData).get("foto")).toBeInstanceOf(File);
  });
  it("503 si falta VISION_API_URL", async () => {
    delete process.env.VISION_API_URL;
    expect((await POST(photo())).status).toBe(503);
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
