import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getUser, userClient } from "@/lib/auth";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getUser: vi.fn(), userClient: vi.fn() }));
const ID = "f8ca2840-a05a-4ffa-850c-8e590146bbdf";
const C30 = { 1: 1, 2: 2, 5: 1, 10: 2 };
const FRASE = "Detecté 30 pesos en total. Encontré dos monedas de 10 pesos, una de 5, dos de 2 y una de 1.";
let n = 0;
const req = (body: unknown, ip = `10.0.0.${++n}`) =>
  new Request("http://localhost/api/asistente/conteo", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) });

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("invitado (sin sesión)", () => {
  it("explica el conteo con el resumen determinista y calcula el total en el servidor, ignorando el del cliente", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    vi.stubEnv("CIERRE_CHAT_URL", "");
    const res = await POST(req({ conteo: C30, total_mxn: 999 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ origen: "resumen", respuesta: FRASE, total_mxn: 30, importes: "Total: 30 pesos. Monedas: 6.", memory: null });
  });
  it("usa el modelo cuando responde con el adaptador esperado y cifras correctas", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/v1/chat/completions");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ adapter: "vendia-monedas-lora", choices: [{ message: { content: "Las monedas de 2 pesos suman 4 pesos." } }] })));
    const res = await POST(req({ conteo: C30, pregunta: "¿Cuánto suman las monedas de 2 pesos?" }));
    expect(await res.json()).toMatchObject({ origen: "modelo", respuesta: "Las monedas de 2 pesos suman 4 pesos." });
  });
  it("si el servidor de inferencia falla devuelve el resumen verificable con aviso, no un error", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/v1/chat/completions");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("caído")));
    const res = await POST(req({ conteo: C30 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ origen: "resumen", respuesta: FRASE, aviso: expect.stringMatching(/conexión/) });
  });
  it("una pregunta fuera de alcance recibe la frase de alcance", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    vi.stubEnv("CIERRE_CHAT_URL", "");
    const j = await (await POST(req({ conteo: C30, pregunta: "¿Cuál es la capital de Francia?" }))).json();
    expect(j.respuesta).toMatch(/^Solo puedo explicar el conteo de monedas/);
  });
  it.each([null, {}, { conteo: { 1: 1 } }, { conteo: { 1: -1, 2: 0, 5: 0, 10: 0 } }, { conteo: { 1: 0.5, 2: 0, 5: 0, 10: 0 } }, { conteo: "x" }])("rechaza el conteo no válido %j", async (body) => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(req(body))).status).toBe(400);
  });
  it.each([{ pregunta: "" }, { pregunta: "x".repeat(241) }, { pregunta: 5 }, { pregunta: "a\nb" }])("rechaza la pregunta no válida %j", async (extra) => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(req({ conteo: C30, ...extra }))).status).toBe(400);
  });
  it("no puede consultar un conteo guardado sin iniciar sesión", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(req({ closingId: ID, conteo: C30 }))).status).toBe(401);
    expect(userClient).not.toHaveBeenCalled();
  });
  it("limita las consultas por IP", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    vi.stubEnv("CIERRE_CHAT_URL", "");
    const codes: number[] = [];
    for (let i = 0; i < 32; i++) codes.push((await POST(req({ conteo: C30 }, "203.0.113.77"))).status);
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes.slice(30)).toEqual([429, 429]);
  });
});

describe("cuenta con un conteo guardado", () => {
  const cuenta = (account: string, existe: boolean) => {
    const escrituras: unknown[] = [];
    const db = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-" + account);
      if (url.pathname === "/rest/v1/assistant_messages") {
        escrituras.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "m1", question: "q", answer: "a", origin: "resumen", amounts: "x", created_at: "2026-11-20T00:00:00Z" }, { status: 201 });
      }
      expect(url.pathname).toBe("/rest/v1/cash_closings");
      expect(url.searchParams.get("id")).toBe("eq." + ID);
      expect(url.searchParams.get("cash_sessions.user_id")).toBe("eq." + account);
      return Response.json(existe ? [{ coins_1: 1, coins_2: 2, coins_5: 1, coins_10: 2 }] : []);
    });
    vi.mocked(getUser).mockResolvedValue({ id: account, email: "a@b.co", token: "jwt-" + account });
    vi.mocked(userClient).mockReturnValue(createClient("http://localhost:54321", "anon", { global: { fetch: db, headers: { Authorization: "Bearer jwt-" + account } } }));
    return escrituras;
  };

  it("lee las cantidades de la base (no confía en el cliente) y guarda la pregunta y la respuesta", async () => {
    const escrituras = cuenta("ana", true);
    vi.stubEnv("CIERRE_CHAT_URL", "");
    const res = await POST(req({ closingId: ID, conteo: { 1: 99, 2: 99, 5: 99, 10: 99 }, pregunta: "¿Cuántas monedas hay?" }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ respuesta: "Hay 6 monedas en total.", total_mxn: 30, memory: { id: "m1" } });
    expect(escrituras).toEqual([{ user_id: "ana", closing_id: ID, question: "¿Cuántas monedas hay?", answer: "Hay 6 monedas en total.", origin: "resumen", amounts: "Total: 30 pesos. Monedas: 6." }]);
  });
  it("la explicación automática no se guarda en la memoria", async () => {
    const escrituras = cuenta("ana", true);
    vi.stubEnv("CIERRE_CHAT_URL", "");
    expect((await POST(req({ closingId: ID }))).status).toBe(200);
    expect(escrituras).toEqual([]);
  });
  it("el conteo de otra cuenta no existe para el usuario: 404 y nada se guarda", async () => {
    const escrituras = cuenta("beto", false);
    vi.stubEnv("CIERRE_CHAT_URL", "");
    expect((await POST(req({ closingId: ID, pregunta: "¿Cuántas monedas hay?" }))).status).toBe(404);
    expect(escrituras).toEqual([]);
  });
  it("un identificador no válido es 400", async () => {
    cuenta("ana", true);
    expect((await POST(req({ closingId: "no-es-uuid" }))).status).toBe(400);
  });
});
