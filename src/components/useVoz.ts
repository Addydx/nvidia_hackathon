"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detener, hablar, vozSoportada } from "@/lib/voz";

/** Estado de la lectura en voz alta: qué elemento se está leyendo, y funciones para leer y detener. */
export function useVoz() {
  const [soportada, setSoportada] = useState(false);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const turno = useRef(0); // una lectura nueva invalida el final de la anterior

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el soporte solo se conoce en el navegador
    setSoportada(vozSoportada());
    const t = turno;
    return () => { t.current++; detener(); };
  }, []);

  const leer = useCallback((id: string, texto: string) => {
    const mio = ++turno.current;
    const ok = hablar(texto, () => { if (turno.current === mio) setLeyendo(null); });
    setLeyendo(ok ? id : null);
    return ok;
  }, []);

  const parar = useCallback(() => {
    turno.current++;
    detener();
    setLeyendo(null);
  }, []);

  return { soportada, leyendo, leer, parar };
}
