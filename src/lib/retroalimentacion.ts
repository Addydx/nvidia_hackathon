import type { Conteo } from "./monedas-asistente";

export type Valoracion = "correcto" | "conteo_incorrecto" | "no_son_monedas";

export type Retro = {
  id: string; // una foto = un registro: reintentos y pulsaciones repetidas lo actualizan, no lo duplican
  valoracion: Valoracion;
  original: Conteo; // lo que leyó el modelo
  corregido: Conteo; // lo que el usuario dejó en pantalla
  actualizadoEn: string;
};

const CLAVE = "vendia-retro-v1";

const leer = (): Retro[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Guarda (o actualiza) la valoración solo en la pestaña actual: no se comparte entre invitados ni cuentas y no incluye fotos. */
export function guardarRetro(r: Retro): Retro[] {
  const todos = [...leer().filter((x) => x.id !== r.id), r].slice(-50);
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(todos));
  } catch {
    /* sin almacenamiento: la valoración sigue visible en pantalla */
  }
  return todos;
}

export const sinMonedas = (c: Record<number, number>) => Object.values(c).every((n) => n === 0);
