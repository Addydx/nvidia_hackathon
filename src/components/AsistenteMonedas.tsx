"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { guestMemory, type MemoryItem } from "@/lib/asistente-memoria";
import { respuestaAuto, type Conteo, type RespuestaAsistente } from "@/lib/monedas-asistente";
import { useProfile } from "./ProfileProvider";
import { useVoz } from "./useVoz";

type Props = {
  /** Cantidades por denominación del resultado de la foto (ya corregidas por el usuario si las cambió). */
  conteo: Conteo;
  /** true si el usuario cambió a mano lo que leyó la foto. */
  corregido?: boolean;
  /** Conteo ya guardado: la conversación se conserva en el perfil (cuenta → Supabase; invitado → la pestaña). Sin él, es efímera. */
  closingId?: string;
};

type Auto = { texto: string; origen: RespuestaAsistente["origen"]; aviso?: string; cargando: boolean };

const post = async (cuerpo: object): Promise<(RespuestaAsistente & { memory?: MemoryItem | null }) | { error: string } | null> => {
  try {
    const res = await fetch("/api/asistente/conteo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(25_000) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { error: data?.error ?? "No se pudo consultar al asistente." };
  } catch {
    return null; // sin conexión
  }
};

/**
 * Asistente de VendIA bajo el resultado de la foto. Explica el conteo con el modelo ajustado cuando está disponible y, si no, con un
 * resumen calculado por código; las cifras nunca las calcula el modelo. Se actualiza al corregir las cantidades y permite escuchar
 * cada explicación en voz alta (Web Speech API, es-MX).
 */
export default function AsistenteMonedas({ conteo, corregido = false, closingId }: Props) {
  const { profile } = useProfile();
  const isUser = profile.mode === "user";
  const voz = useVoz();
  const clave = JSON.stringify(conteo) + String(corregido);
  const [auto, setAuto] = useState<Auto>({ texto: respuestaAuto(conteo, corregido), origen: "resumen", cargando: true });
  const [historial, setHistorial] = useState<MemoryItem[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState("");
  const pedido = useRef(0);
  const conteoRef = useRef({ conteo, corregido });
  useEffect(() => { conteoRef.current = { conteo, corregido }; }); // siempre el último conteo, sin recrear los efectos

  // Explicación automática: se recalcula (con un pequeño retraso) cada vez que cambian las cantidades.
  useEffect(() => {
    const mio = ++pedido.current;
    const { conteo: c, corregido: k } = conteoRef.current;
    setAuto({ texto: respuestaAuto(c, k), origen: "resumen", cargando: true });
    if (!closingId) { setHistorial([]); setError(""); } // en el modo en vivo, una corrección reinicia la conversación (contexto nuevo)
    const t = setTimeout(async () => {
      const r = await post({ conteo: c, corregido: k, ...(closingId && { closingId }) });
      if (mio !== pedido.current) return; // llegó tarde: ya hay otro conteo
      if (r && !("error" in r)) setAuto({ texto: r.respuesta, origen: r.origen, aviso: r.aviso, cargando: false });
      else setAuto({ texto: respuestaAuto(c, k), origen: "resumen", aviso: r ? r.error : "Sin conexión con el asistente; este resumen se calculó en tu dispositivo.", cargando: false });
    }, 450);
    return () => clearTimeout(t);
  }, [clave, closingId]);

  // Conteo guardado: se recupera la conversación del perfil activo.
  useEffect(() => {
    if (!closingId) return;
    let vivo = true;
    if (!isUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la memoria del invitado se lee de la pestaña
      setHistorial(guestMemory.load(closingId));
      return;
    }
    fetch(`/api/asistente/memoria?closingId=${closingId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => vivo && setHistorial(d.items ?? []))
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [closingId, isUser]);

  async function preguntar(e: FormEvent) {
    e.preventDefault();
    const p = pregunta.trim();
    if (!p || pendiente) return;
    setPendiente(true);
    setError("");
    const { conteo: c, corregido: k } = conteoRef.current;
    const r = await post({ conteo: c, corregido: k, pregunta: p, ...(closingId && { closingId }) });
    setPendiente(false);
    if (!r) return setError("No hay conexión con el asistente. Revisa tu internet e inténtalo de nuevo.");
    if ("error" in r) return setError(r.error);
    const item: MemoryItem = r.memory ?? { id: crypto.randomUUID(), question: p, answer: r.respuesta, origin: r.origen, amounts: r.importes, createdAt: new Date().toISOString() };
    if (closingId && !isUser) setHistorial(guestMemory.add(closingId, item));
    else setHistorial((h) => [...h, item]);
    setPregunta("");
  }

  const etiqueta = (o: MemoryItem["origin"]) => (o === "modelo" ? "Respuesta de VendIA" : "Resumen automático");
  const escuchar = (id: string, texto: string, rotulo: string) =>
    voz.leyendo === id ? (
      <button key={id} type="button" className="btn-voz" onClick={voz.parar} aria-label="Detener la lectura">■ Detener</button>
    ) : (
      <button key={id} type="button" className="btn-voz" onClick={() => voz.leer(id, texto)} aria-label={rotulo}>🔊 {rotulo === "Escuchar resultado" ? "Escuchar resultado" : "Escuchar"}</button>
    );

  return (
    <section className="expected asistente" aria-label="Asistente de VendIA">
      <span className="label">Asistente de VendIA</span>
      <p className="auto-texto" data-testid="asistente-auto" aria-live="polite">{auto.texto}</p>
      <p className="muted small" data-testid="asistente-origen">
        {auto.cargando ? "Actualizando explicación…" : etiqueta(auto.origen)}
        {auto.aviso ? ` · ${auto.aviso}` : ""}
      </p>
      {voz.soportada ? (
        <div className="voz-fila">
          {escuchar("auto", auto.texto, "Escuchar resultado")}
        </div>
      ) : (
        <p className="muted small" role="status">Tu navegador no admite lectura en voz alta.</p>
      )}

      <form onSubmit={preguntar}>
        <label htmlFor={`pregunta-${closingId ?? "vivo"}`}>Pregunta sobre las monedas, las cantidades o el total</label>
        <input id={`pregunta-${closingId ?? "vivo"}`} placeholder="¿Cuánto suman las monedas de 10 pesos?" value={pregunta} maxLength={240}
          disabled={pendiente} onChange={(e) => setPregunta(e.target.value)} />
        <button className="btn secondary" disabled={pendiente || !pregunta.trim()}>{pendiente ? "Consultando…" : "Preguntar"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      <ul className="history" aria-label="Conversación" aria-live="polite" data-testid="historial">
        {historial.map((m) => (
          <li key={m.id}>
            <p className="q">{m.question}</p>
            <p className="a"><strong>{etiqueta(m.origin)}</strong> · {m.answer}</p>
            {voz.soportada && escuchar(m.id, m.answer, "Escuchar respuesta")}
          </li>
        ))}
      </ul>
      {closingId && <p className="muted small">{isUser ? "La conversación se guarda en tu cuenta." : "La conversación se guarda solo en esta pestaña."}</p>}
    </section>
  );
}
