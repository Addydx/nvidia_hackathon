import { afterEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/caja/service";
import { explicar } from "@/lib/asistente";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(), adminClient: vi.fn() }));
const id = "f8ca2840-a05a-4ffa-850c-8e590146bbdf";
const row = { expected_cents: 3000, counted_cents: 2700, difference_cents: -300 };
const question = (pregunta: unknown = "¿Qué pasó y por qué?") => new Request("http://localhost/api/cierre/preguntar", {
  method: "POST", body: JSON.stringify({ closingId: id, pregunta, userId: "propietaria", difference_cents: 999 }),
});

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("requiere sesión antes de consultar", async () => {
  vi.mocked(requireUser).mockRejectedValue(new HttpError(401, "Inicia sesión"));
  expect((await POST(question())).status).toBe(401);
  expect(adminClient).not.toHaveBeenCalled();
});

it.each(["propietaria", "otra"])("restringe la consulta al cierre y a la cuenta %s", async (account) => {
  vi.mocked(requireUser).mockResolvedValue({ id: account, email: "demo@example.com" });
  const dbFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/v1/cash_closings");
    expect(url.searchParams.get("select")).toContain("cash_sessions!inner(user_id)");
    expect(url.searchParams.get("id")).toBe("eq." + id);
    expect(url.searchParams.get("cash_sessions.user_id")).toBe("eq." + account);
    return Response.json(account === "propietaria" ? [row] : []);
  });
  vi.mocked(adminClient).mockReturnValue(createClient("http://localhost:54321", "test-key", { global: { fetch: dbFetch } }));
  vi.stubEnv("CIERRE_CHAT_URL", "http://modelo.test/chat");
  const inference = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    choices: [{ message: { content: "Sobran $999 MXN por pagos pendientes." } }],
  }));
  vi.stubGlobal("fetch", inference);
  const res = await POST(question());
  expect(dbFetch).toHaveBeenCalledOnce();
  expect(res.status).toBe(account === "propietaria" ? 200 : 404);
  if (account === "propietaria") {
    expect(await res.json()).toMatchObject({ origen: "resumen", respuesta: "Faltan $3 MXN. Con los datos del cierre no puedo determinar la causa." });
    expect(inference).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(inference.mock.calls[0][1]?.body));
    expect(payload.messages[1].content).toContain("Pregunta: ¿Qué pasó y por qué?");
    expect(payload.model).toBe("corte-lora");
    expect(payload.messages[1].content).toContain("Diferencia: -$3 MXN");
  } else expect(inference).not.toHaveBeenCalled();
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
  vi.mocked(requireUser).mockResolvedValue({id: "cuenta", email: "demo@example.com"});
  expect((await POST(question(pregunta))).status).toBe(400);
  expect(adminClient).not.toHaveBeenCalled();
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
