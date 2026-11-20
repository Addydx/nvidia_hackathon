import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ADAPTADOR_ESPERADO, ALCANCE, LIMITE, SYSTEM, explicar, hechos, importes, listaMonedas, parseConteo, respuestaAuto,
  respuestaDeterminista, totalMonedas, totalPesos, verificar, type Conteo,
} from "./monedas-asistente";

type Ej = { conteo: Record<string, number>; corregido: boolean; pregunta: string; respuesta: string; tipo: string; messages: { role: string; content: string }[] };
const cargar = (n: string): Ej[] =>
  readFileSync(new URL(`../../asistente/vendia-monedas/datos/${n}.jsonl`, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const conteoDe = (e: Ej): Conteo => ({ 10: e.conteo["10"], 5: e.conteo["5"], 2: e.conteo["2"], 1: e.conteo["1"] });

const C30: Conteo = { 10: 2, 5: 1, 2: 2, 1: 1 }; // ejemplo del enunciado: $30
const FRASE_30 = "Detecté 30 pesos en total. Encontré dos monedas de 10 pesos, una de 5, dos de 2 y una de 1.";

describe("conteo exacto de $30 MXN", () => {
  it("calcula total y monedas con código", () => {
    expect(totalPesos(C30)).toBe(30);
    expect(totalMonedas(C30)).toBe(6);
  });
  it("genera la explicación automática esperada, palabra por palabra", () => {
    expect(respuestaAuto(C30)).toBe(FRASE_30);
    expect(listaMonedas(C30)).toBe("dos monedas de 10 pesos, una de 5, dos de 2 y una de 1");
  });
  it("entrega al modelo hechos con subtotales ya calculados", () => {
    expect(hechos(C30)).toBe(
      [
        "Hechos verificados del conteo (calculados por la aplicación):",
        "- Monedas de 10 pesos: 2 (subtotal 20 pesos)",
        "- Monedas de 5 pesos: 1 (subtotal 5 pesos)",
        "- Monedas de 2 pesos: 2 (subtotal 4 pesos)",
        "- Monedas de 1 peso: 1 (subtotal 1 peso)",
        "- Total de monedas: 6",
        "- Total: 30 pesos",
      ].join("\n"),
    );
  });
  it("singulares, ceros y corrección", () => {
    expect(respuestaAuto({ 10: 0, 5: 0, 2: 0, 1: 1 })).toBe("Detecté 1 peso en total. Encontré una moneda de 1 peso.");
    expect(respuestaAuto({ 10: 0, 5: 0, 2: 0, 1: 0 })).toBe("No detecté monedas en la foto. El total es 0 pesos.");
    expect(respuestaAuto({ 10: 1, 5: 2, 2: 3, 1: 2 }, true)).toBe("Con tu corrección, el total es de 28 pesos. Hay una moneda de 10 pesos, dos de 5, tres de 2 y dos de 1.");
    expect(respuestaAuto({ 10: 25, 5: 0, 2: 0, 1: 3 })).toBe("Detecté 253 pesos en total. Encontré 25 monedas de 10 pesos y tres de 1.");
  });
  it("importes verificados para el historial", () => expect(importes(C30)).toBe("Total: 30 pesos. Monedas: 6."));
});

describe("paridad con el generador de datos de Python (el modelo se entrenó con estos textos)", () => {
  const todos = [...cargar("train"), ...cargar("valid"), ...cargar("test")];
  it("los hechos y la instrucción del sistema son idénticos a los del entrenamiento", () => {
    for (const e of todos) {
      expect(e.messages[0].content).toBe(SYSTEM);
      expect(e.messages[1].content.startsWith(hechos(conteoDe(e), e.corregido) + "\nPregunta: ")).toBe(true);
    }
  });
  it("la explicación automática coincide en todos los ejemplos de ese tipo", () => {
    const autos = todos.filter((e) => e.tipo === "auto");
    expect(autos.length).toBeGreaterThan(100);
    for (const e of autos) expect(respuestaAuto(conteoDe(e), e.corregido)).toBe(e.respuesta);
  });
  it("el verificador acepta todas las respuestas de referencia", () => {
    for (const e of todos) expect(verificar(e.respuesta, conteoDe(e), e.tipo === "auto"), JSON.stringify(e.respuesta)).toMatchObject({ ok: true });
  });
  it("la respuesta determinista reproduce la referencia en la gran mayoría de las preguntas (el resto cae en el resumen)", () => {
    const mal = todos.filter((e) => respuestaDeterminista(e.pregunta, conteoDe(e), e.corregido) !== e.respuesta);
    // lo que no coincide nunca puede ser una cifra falsa: siempre pasa el verificador o es una frase de alcance/límite
    for (const e of mal) {
      const r = respuestaDeterminista(e.pregunta, conteoDe(e), e.corregido);
      expect(verificar(r, conteoDe(e)).ok, `${e.pregunta} -> ${r}`).toBe(true);
    }
    expect(mal.length / todos.length).toBeLessThan(0.1);
  });
});

describe("verificación de afirmaciones numéricas del modelo", () => {
  it.each([
    ["Detecté 35 pesos en total. Encontré dos monedas de 10 pesos, una de 5, dos de 2 y una de 1.", true],
    ["Hay tres monedas de 5 pesos.", false],
    ["Encontré una moneda de 20 pesos.", false],
    ["Las monedas de 2 pesos suman 5 pesos.", false],
    ["Hay 7 monedas en total.", false],
    ["El total es de 31 pesos.", false],
    ["Detecté 30 pesos en total. Encontré dos monedas de 10 pesos.", true], // incompleta, pero sin cifras falsas
  ])("rechaza %j", (resp, auto) => {
    expect(verificar(resp, C30, auto).ok).toBe(false);
  });
  it.each([
    "Las monedas de 2 pesos suman 4 pesos.",
    "Hay 6 monedas en total.",
    "Encontré una moneda de 5 pesos.",
    "El total es de 30 pesos.",
    FRASE_30,
    ALCANCE,
    LIMITE,
  ])("acepta %j", (resp) => expect(verificar(resp, C30, resp === FRASE_30).ok).toBe(true));
  it("exige que la explicación automática mencione el total y cada denominación", () => {
    expect(verificar("Detecté 30 pesos en total. Encontré dos monedas de 10 pesos y una de 5.", C30, true).ok).toBe(false);
  });
});

describe("respuesta determinista (respaldo verificable)", () => {
  it.each([
    ["¿Cuánto suman las monedas de 2 pesos?", "Las monedas de 2 pesos suman 4 pesos."],
    ["¿Cuántas monedas de 5 pesos hay?", "Encontré una moneda de 5 pesos."],
    ["¿Cuántas monedas hay?", "Hay 6 monedas en total."],
    ["¿Cuál es el total?", "El total es de 30 pesos."],
    ["Explica el conteo.", FRASE_30],
    ["¿Cuál es la capital de Francia?", ALCANCE],
    ["¿Son monedas falsas?", LIMITE],
    [null, FRASE_30],
  ])("%j", (q, esperado) => expect(respuestaDeterminista(q, C30)).toBe(esperado));
  it("denominación sin monedas", () => {
    expect(respuestaDeterminista("¿Cuántas monedas de 10 pesos hay?", { 10: 0, 5: 3, 2: 0, 1: 4 })).toBe("No encontré monedas de 10 pesos.");
    expect(respuestaDeterminista("¿Cuánto suman las monedas de 10 pesos?", { 10: 0, 5: 3, 2: 0, 1: 4 })).toBe("No hay monedas de 10 pesos, así que ese subtotal es 0 pesos.");
  });
});

describe("parseConteo", () => {
  it("acepta el formato del servicio de fotos y rechaza lo demás", () => {
    expect(parseConteo({ 1: 1, 2: 2, 5: 1, 10: 2 })).toEqual({ 1: 1, 2: 2, 5: 1, 10: 2 });
    for (const malo of [null, [], { 1: 1 }, { 1: -1, 2: 0, 5: 0, 10: 0 }, { 1: 1.5, 2: 0, 5: 0, 10: 0 }, { 1: "1", 2: 0, 5: 0, 10: 0 }, { 1: 100000, 2: 0, 5: 0, 10: 0 }])
      expect(parseConteo(malo)).toBeNull();
  });
});

describe("explicar con el servicio del modelo (simulado)", () => {
  const modelo = (content: string, adapter: unknown = ADAPTADOR_ESPERADO, status = 200) =>
    vi.fn(async () => Response.json({ adapter, choices: [{ message: { content } }] }, { status }));
  const env = (f: typeof fetch) => ({ url: "http://modelo.test/v1/chat/completions", key: "clave-de-prueba", fetch: f });

  it("sin servicio configurado usa el resumen determinista", async () => {
    expect(await explicar(C30, null, false, { url: "" })).toMatchObject({ origen: "resumen", respuesta: FRASE_30 });
  });
  it("acepta la respuesta del adaptador nuevo cuando las cifras cuadran y envía solo hechos verificados", async () => {
    const f = modelo(FRASE_30);
    const r = await explicar(C30, null, false, env(f as unknown as typeof fetch));
    expect(r).toMatchObject({ origen: "modelo", respuesta: FRASE_30, importes: "Total: 30 pesos. Monedas: 6." });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("vendia-monedas");
    expect(body.messages[1].content).toContain("- Total: 30 pesos");
    expect(body.messages[1].content).toContain("Pregunta: Explica el conteo.");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer clave-de-prueba");
  });
  it("una pregunta sobre subtotales llega al modelo y se valida", async () => {
    const r = await explicar(C30, "¿Cuánto suman las monedas de 2 pesos?", false, env(modelo("Las monedas de 2 pesos suman 4 pesos.") as unknown as typeof fetch));
    expect(r).toMatchObject({ origen: "modelo", respuesta: "Las monedas de 2 pesos suman 4 pesos." });
  });
  it("rechaza una respuesta que inventa cifras y muestra el resumen con aviso", async () => {
    const r = await explicar(C30, null, false, env(modelo("Detecté 45 pesos en total. Encontré cinco monedas de 20 pesos.") as unknown as typeof fetch));
    expect(r).toMatchObject({ origen: "resumen", respuesta: FRASE_30 });
    expect(r.aviso).toMatch(/no coinciden/);
  });
  it("rechaza una respuesta que no procede del adaptador esperado (p. ej. el modelo anterior)", async () => {
    for (const adapter of ["corte-lora", null]) {
      const r = await explicar(C30, null, false, env(modelo(FRASE_30, adapter) as unknown as typeof fetch));
      expect(r.origen).toBe("resumen");
      expect(r.aviso).toMatch(/adaptador/);
    }
  });
  it("maneja errores del servicio y desconexiones sin lanzar", async () => {
    expect((await explicar(C30, null, false, env(modelo("x", ADAPTADOR_ESPERADO, 500) as unknown as typeof fetch)))).toMatchObject({ origen: "resumen", aviso: expect.stringMatching(/error/) });
    expect((await explicar(C30, null, false, env(vi.fn().mockRejectedValue(new Error("sin red")) as unknown as typeof fetch)))).toMatchObject({ origen: "resumen", aviso: expect.stringMatching(/conexión/) });
  });
  it("una pregunta fuera de alcance recibe la frase de alcance (modelo o respaldo)", async () => {
    expect((await explicar(C30, "¿Cuál es la capital de Francia?", false, env(modelo(ALCANCE) as unknown as typeof fetch)))).toMatchObject({ origen: "modelo", respuesta: ALCANCE });
    expect((await explicar(C30, "¿Cuál es la capital de Francia?", false, { url: "" })).respuesta).toBe(ALCANCE);
  });
  it("una corrección manual cambia el contexto que recibe el modelo", async () => {
    const f = modelo("Con tu corrección, el total es de 28 pesos. Hay una moneda de 10 pesos, dos de 5, tres de 2 y dos de 1.");
    const r = await explicar({ 10: 1, 5: 2, 2: 3, 1: 2 }, null, true, env(f as unknown as typeof fetch));
    expect(r.origen).toBe("modelo");
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages[1].content).toContain("El usuario corrigió el conteo manualmente: sí");
    expect(body.messages[1].content).toContain("- Total: 28 pesos");
  });
});
