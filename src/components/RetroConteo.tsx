"use client";

import { useEffect, useRef, useState } from "react";
import type { Conteo } from "@/lib/monedas-asistente";
import { guardarRetro, type Valoracion } from "@/lib/retroalimentacion";

type Props = { id: string; original: Conteo; actual: Conteo; onOtraFoto: () => void };

/** «¿El conteo fue correcto?»: valoración discreta bajo el resultado. Guarda original y cantidades corregidas, una sola vez por foto. */
export default function RetroConteo({ id, original, actual, onOtraFoto }: Props) {
  const [val, setVal] = useState<Valoracion | null>(null);
  const [reportando, setReportando] = useState(false);
  const actualRef = useRef(actual);
  useEffect(() => { actualRef.current = actual; });

  const registrar = (v: Valoracion) => {
    setVal(v);
    setReportando(false);
    guardarRetro({ id, valoracion: v, original, corregido: actual, actualizadoEn: new Date().toISOString() });
  };

  // Si ya valoró y luego corrige, el mismo registro se actualiza con las cantidades finales.
  const clave = JSON.stringify(actual);
  useEffect(() => {
    if (val) guardarRetro({ id, valoracion: val, original, corregido: actualRef.current, actualizadoEn: new Date().toISOString() });
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps -- solo reacciona a cambios del conteo

  return (
    <div className="retro" role="group" aria-label="Valoración del conteo">
      <span className="retro-q">¿El conteo fue correcto?</span>
      <div className="retro-op">
        <button type="button" aria-pressed={val === "correcto"} onClick={() => registrar("correcto")}>Sí, correcto</button>
        <button type="button" aria-pressed={val === "conteo_incorrecto" || val === "no_son_monedas" || reportando} onClick={() => setReportando((r) => !r)}>Reportar error</button>
      </div>
      {reportando && (
        <div className="retro-op" role="group" aria-label="Tipo de error">
          <button type="button" onClick={() => registrar("conteo_incorrecto")}>Conteo incorrecto</button>
          <button type="button" onClick={() => registrar("no_son_monedas")}>No son monedas</button>
        </div>
      )}
      <p className="retro-nota" role="status">
        {val === "correcto" && "Gracias. Valoración anotada en esta sesión."}
        {val === "conteo_incorrecto" && "Anotado. Corrige las cantidades con − y +; se conservan la lectura original y tu corrección."}
        {val === "no_son_monedas" && (
          <>Anotado. VendIA solo cuenta monedas de $1, $2, $5 y $10. <button type="button" className="btn-quiet" onClick={onOtraFoto}>Probar con otra foto</button></>
        )}
      </p>
    </div>
  );
}
