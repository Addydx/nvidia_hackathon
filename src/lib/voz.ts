/**
 * Lectura en voz alta con la Web Speech API del propio navegador (sin servicios externos). Idioma es-MX; si no hay una voz es-MX
 * se usa la mejor voz en español disponible. Al iniciar una lectura se cancela la anterior.
 */
export type Sintesis = Pick<SpeechSynthesis, "speak" | "cancel" | "getVoices">;

export function vozSoportada(win: object = typeof window === "undefined" ? {} : window): boolean {
  return "speechSynthesis" in win && "SpeechSynthesisUtterance" in win;
}

/** es-MX primero; después cualquier es-*; si no hay, deja la voz por defecto del navegador. */
export function elegirVoz(voces: Pick<SpeechSynthesisVoice, "lang" | "name">[]): (typeof voces)[number] | undefined {
  const l = (v: { lang: string }) => v.lang.replace("_", "-").toLowerCase();
  return voces.find((v) => l(v) === "es-mx") ?? voces.find((v) => l(v).startsWith("es-419")) ?? voces.find((v) => l(v).startsWith("es"));
}

/** Devuelve false si el navegador no admite voz. `alFinalizar` se llama al terminar o fallar (no al cancelar por una lectura nueva). */
export function hablar(texto: string, alFinalizar?: () => void, win: Window = window): boolean {
  if (!vozSoportada(win) || !texto.trim()) return false;
  const s = win.speechSynthesis;
  s.cancel(); // cancela la lectura anterior antes de empezar otra
  const Utterance = (win as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
  const u = new Utterance(texto);
  u.lang = "es-MX";
  const voz = elegirVoz(s.getVoices());
  if (voz) u.voice = voz as SpeechSynthesisVoice;
  u.rate = 1;
  u.onend = () => alFinalizar?.();
  u.onerror = () => alFinalizar?.();
  s.speak(u);
  return true;
}

export function detener(win: Window = window) {
  if (vozSoportada(win)) win.speechSynthesis.cancel();
}
