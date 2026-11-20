import { describe, expect, it, vi } from "vitest";
import { detener, elegirVoz, hablar, vozSoportada } from "./voz";

class Enunciado { lang = ""; voice: unknown = null; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
const ventana = (voces: { lang: string; name: string }[] = []) => {
  const eventos: string[] = [];
  const speechSynthesis = {
    speak: vi.fn((u: Enunciado) => eventos.push("speak:" + u.text)),
    cancel: vi.fn(() => eventos.push("cancel")),
    getVoices: vi.fn(() => voces),
  };
  return { win: { speechSynthesis, SpeechSynthesisUtterance: Enunciado } as unknown as Window, speechSynthesis, eventos };
};

describe("lectura en voz alta (Web Speech API)", () => {
  it("detecta navegadores sin soporte y no lanza", () => {
    expect(vozSoportada({})).toBe(false);
    expect(vozSoportada({ speechSynthesis: {} })).toBe(false);
    expect(hablar("hola", undefined, {} as Window)).toBe(false);
    expect(() => detener({} as Window)).not.toThrow();
  });
  it("configura el idioma es-MX y usa la voz es-MX cuando existe", () => {
    const { win, speechSynthesis } = ventana([{ lang: "en-US", name: "A" }, { lang: "es-ES", name: "B" }, { lang: "es-MX", name: "C" }]);
    expect(hablar("Detecté 30 pesos en total.", undefined, win)).toBe(true);
    const u = speechSynthesis.speak.mock.calls[0][0] as unknown as Enunciado;
    expect(u.lang).toBe("es-MX");
    expect(u.text).toBe("Detecté 30 pesos en total.");
    expect((u.voice as { name: string }).name).toBe("C");
  });
  it("sin voz es-MX usa otra en español; sin ninguna deja la del navegador pero mantiene es-MX", () => {
    expect(elegirVoz([{ lang: "en-US", name: "A" }, { lang: "es_ES", name: "B" }])?.name).toBe("B");
    expect(elegirVoz([{ lang: "es-419", name: "L" }, { lang: "es-ES", name: "B" }])?.name).toBe("L");
    expect(elegirVoz([{ lang: "en-US", name: "A" }])).toBeUndefined();
    const { win, speechSynthesis } = ventana([]);
    hablar("hola", undefined, win);
    expect((speechSynthesis.speak.mock.calls[0][0] as unknown as Enunciado).lang).toBe("es-MX");
  });
  it("cancela la lectura anterior antes de iniciar otra", () => {
    const { win, eventos } = ventana();
    hablar("primera", undefined, win);
    hablar("segunda", undefined, win);
    expect(eventos).toEqual(["cancel", "speak:primera", "cancel", "speak:segunda"]);
  });
  it("el control de detener cancela la lectura", () => {
    const { win, speechSynthesis } = ventana();
    hablar("hola", undefined, win);
    detener(win);
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(2);
  });
  it("avisa cuando termina o falla y no lee textos vacíos", () => {
    const { win, speechSynthesis } = ventana();
    const fin = vi.fn();
    hablar("hola", fin, win);
    const u = speechSynthesis.speak.mock.calls[0][0] as unknown as Enunciado;
    u.onend?.();
    u.onerror?.();
    expect(fin).toHaveBeenCalledTimes(2);
    expect(hablar("   ", fin, win)).toBe(false);
  });
});
