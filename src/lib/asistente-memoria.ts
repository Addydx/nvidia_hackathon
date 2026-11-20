export type MemoryItem = {
  id: string;
  question: string;
  answer: string;
  origin: "modelo" | "resumen";
  amounts: string;
  createdAt: string;
};

const MAX_ITEMS = 20;
const key = (closingId: string) => `cc.guest.memoria.v1.${closingId}`;

/**
 * Memoria del asistente del INVITADO: vive en sessionStorage de la pestaña. Sobrevive a una recarga y no se comparte
 * con otras pestañas, navegadores ni dispositivos; el servidor no guarda nada de invitados.
 */
export const guestMemory = {
  load(closingId: string): MemoryItem[] {
    try {
      const raw = window.sessionStorage.getItem(key(closingId));
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },
  add(closingId: string, item: MemoryItem): MemoryItem[] {
    const next = [...guestMemory.load(closingId), item].slice(-MAX_ITEMS);
    try {
      window.sessionStorage.setItem(key(closingId), JSON.stringify(next));
    } catch {
      /* sin almacenamiento: la conversación sigue en pantalla */
    }
    return next;
  },
};
