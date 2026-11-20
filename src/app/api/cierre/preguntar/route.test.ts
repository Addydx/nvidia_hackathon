import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getUser, userClient } from "@/lib/auth";
import { explicar } from "@/lib/asistente";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getUser: vi.fn(), userClient: vi.fn() }));
const id = "f8ca2840-a05a-4ffa-850c-8e590146bbdf";
const row = { expected_cents: 3000, counted_cents: 2700, difference_cents: -300 };
const question = (pregunta: unknown = "¿Qué pasó y por qué?") => new Request("http://localhost/api/cierre/preguntar", {
  method: "POST", body: JSON.stringify({ closingId: id, pregunta, userId: "propietaria", difference_cents: 999 }),
});

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const guest = (importes: unknown, pregunta: unknown = "¿Cuánto falta?") => new Request("http://localhost/api/cierre/preguntar", {
  method: "POST", body: JSON.stringify({ importes, pregunta, closingId: id }),
});

it("sin sesión ni importes no consulta ningún cierre guardado", async () => {
  vi.mocked(getUser).mockResolvedValue(null);
  const res = await POST(question());
  expect(res.status).toBe(401);
  expect(userClient).not.toHaveBeenCalled();
});

it("invitado: explica los importes de su pestaña, recalcula la diferencia y no guarda nada", async () => {
  vi.mocked(getUser).mockResolvedValue(null);
  vi.stubEnv("CIERRE_CHAT_URL", "");
  const res = await POST(guest({ expectedCents: 3000, countedCents: 2700, difference_cents: 999 }, "¿Qué pasó?"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ origen: "resumen", importes: "Esperado: $30 MXN. Contado: $27 MXN. Diferencia: -$3 MXN." });
  expect(body.memory).toBeUndefined(); // el servidor no guarda memoria de invitados
  expect(userClient).not.toHaveBeenCalled();
});

it("invitado: sin efectivo esperado el asistente pide indicarlo y no inventa una diferencia", async () => {
  vi.mocked(getUser).mockResolvedValue(null);
  vi.stubEnv("CIERRE_CHAT_URL", "");
  const res = await POST(guest({ expectedCents: null, countedCents: 2700 }, "¿Cuadró?"));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ origen: "resumen", respuesta: expect.stringContaining("Necesito el efectivo esperado") });
});

it.each([[{ expectedCents: -1, countedCents: 0 }], [{ expectedCents: 1.5, countedCents: 0 }], [{ expectedCents: "1", countedCents: 0 }], [{ expectedCents: null, countedCents: null }], [null]])(
  "invitado: rechaza importes no válidos %j", async (importes) => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(guest(importes))).status).toBe(401);
  },
);

it("invitado: limita las consultas por IP", async () => {
  vi.mocked(getUser).mockResolvedValue(null);
  vi.stubEnv("CIERRE_CHAT_URL", "");
  const mk = () => new Request("http://localhost/api/cierre/preguntar", {
    method: "POST", headers: { "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ importes: { expectedCents: 100, countedCents: 100 }, pregunta: "¿Cuadró?" }),
  });
  const codes: number[] = [];
  for (let i = 0; i < 22; i++) codes.push((await POST(mk())).status);
  expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
  expect(codes.slice(20)).toEqual([429, 429]);
});

it.each(["propietaria", "otra"])("cuenta: restringe la consulta al cierre y a la cuenta %s y guarda la memoria", async (account) => {
  vi.mocked(getUser).mockResolvedValue({ id: account, email: "demo@example.com", token: "jwt-" + account });
  const writes: unknown[] = [];
  const dbFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-" + account);
    if (url.pathname === "/rest/v1/assistant_messages") {
      writes.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "m1", question: "q", answer: "a", origin: "resumen", amounts: "x", created_at: "2026-11-20T00:00:00Z" }, { status: 201 });
    }
    expect(url.pathname).toBe("/rest/v1/cash_closings");
    expect(url.searchParams.get("select")).toContain("cash_sessions!inner(user_id)");
    expect(url.searchParams.get("id")).toBe("eq." + id);
    expect(url.searchParams.get("cash_sessions.user_id")).toBe("eq." + account);
    return Response.json(account === "propietaria" ? [row] : []);
  });
  vi.mocked(userClient).mockReturnValue(createClient("http://localhost:54321", "anon-key", { global: { fetch: dbFetch, headers: { Authorization: "Bearer jwt-" + account } } }));
  vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/chat");
  const inference = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    choices: [{ message: { content: "Sobran $999 MXN por pagos pendientes." } }],
  }));
  vi.stubGlobal("fetch", inference);
  const res = await POST(question());
  expect(res.status).toBe(account === "propietaria" ? 200 : 404);
  if (account === "propietaria") {
    const body = await res.json();
    expect(body).toMatchObject({ origen: "resumen", respuesta: "Faltan $3 MXN. Con los datos del cierre no puedo determinar la causa." });
    expect(body.memory).toMatchObject({ id: "m1" });
    expect(writes).toEqual([{ user_id: "propietaria", closing_id: id, question: "¿Qué pasó y por qué?", answer: expect.any(String), origin: "resumen", amounts: expect.stringContaining("-$3 MXN") }]);
    expect(inference).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(inference.mock.calls[0][1]?.body));
    expect(payload.messages[1].content).toContain("Pregunta: ¿Qué pasó y por qué?");
    expect(payload.model).toBe("corte-lora");
    expect(payload.messages[1].content).toContain("Diferencia: -$3 MXN");
  } else {
    expect(inference).not.toHaveBeenCalled();
    expect(writes).toEqual([]); // nada se guarda si el cierre no es de la cuenta
  }
});

it.each([
  [null, null, null, "Necesito el efectivo esperado y contado"],
  [100, null, null, "Necesito el efectivo contado"],
  [null, 0, null, "Necesito el efectivo esperado"],
  [100, 100, 0, "La caja cuadra."],
  [99, 100, 1, "Sobran $0.01 MXN."],
])("explica los datos disponibles %s %s", async (e,c,d,prefix) => {
  vi.stubEnv("CIERRE_CHAT_URL", "");
  expect((await explicar({expected_cents: e as number|null, counted_cents:c as number|null, difference_cents:d as number|null}, "¿Cuadró?")).respuesta).toContain(prefix);
});

it("protege los 12 casos frente a las respuestas reales guardadas en la T4", async () => {
  const { default: cases } = await import("../../../../../asistente/t4/ajustado.json");
  vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/chat");
  for (const [index, sample] of cases.entries()) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      choices: [{ message: { content: sample.respuesta } }],
    })));
    const answer = await explicar({
      expected_cents: sample.esperado, counted_cents: sample.contado, difference_cents: sample.diferencia,
    }, sample.pregunta);
    expect(answer.importes).toContain("Diferencia:");
    if (answer.origen === "modelo") expect(answer.respuesta).toBe(sample.respuesta);
    if ([2, 4, 7, 11].includes(index)) expect(answer.origen).toBe("resumen");
  }
});

it.each([null, "", "  ", "x".repeat(241), { pregunta: "otra" }])("rechaza preguntas no válidas", async pregunta => {
  vi.mocked(getUser).mockResolvedValue({ id: "cuenta", email: "demo@example.com", token: "jwt" });
  expect((await POST(question(pregunta))).status).toBe(400);
  expect(userClient).not.toHaveBeenCalled();
});

it.each([
  ["¿Cuánto se esperaba?", "El efectivo esperado era $30 MXN.", "modelo"],
  ["¿Cuánto se esperaba?", "El efectivo esperado era $27 MXN.", "resumen"],
  ["¿Cuánto se esperaba?", "Se contaron $27 MXN.", "resumen"],
  ["¿Cuánto se esperaba?", "Se esperaban $30.00 MXN.", "modelo"],
  ["¿Cuánto contaste?", "El importe contado fue de $27 MXN.", "modelo"],
  ["¿Qué pasó?", "Se contó menos efectivo del esperado. Faltan $3 MXN.", "modelo"],
  ["¿Qué pasó?", "Faltan $3 MXN. Fue un robo.", "resumen"],
  ["¿Cuál es la capital de Francia?", "París.", "resumen"],
])("verifica el contenido de %s", async (q, content, origen) => {
  vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/chat");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content } }] })));
  const result = await explicar(row, q);
  expect(result.origen).toBe(origen);
  expect(result.importes).toBe("Esperado: $30 MXN. Contado: $27 MXN. Diferencia: -$3 MXN.");
  if (origen === "modelo") expect(result.respuesta).toBe(content);
});

it("muestra el resumen si el servicio se desconecta", async () => {
  vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/chat");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin conexión")));
  expect(await explicar(row, "¿Qué pasó?")).toMatchObject({ origen: "resumen", importes: expect.stringContaining("-$3 MXN") });
});
