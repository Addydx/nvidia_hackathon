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
      const r = await post({ conteo: c, corregido: k, ...(closingId && isUser && { closingId }) });
      if (mio !== pedido.current) return; // llegó tarde: ya hay otro conteo
      if (r && !("error" in r)) setAuto({ texto: r.respuesta, origen: r.origen, aviso: r.aviso, cargando: false });
      else setAuto({ texto: respuestaAuto(c, k), origen: "resumen", aviso: r ? r.error : "Sin conexión con el asistente; este resumen se calculó en tu dispositivo.", cargando: false });
    }, 450);
    return () => clearTimeout(t);
  }, [clave, closingId, isUser]);

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
    const r = await post({ conteo: c, corregido: k, pregunta: p, ...(closingId && isUser && { closingId }) });
    setPendiente(false);
    if (!r) return setError("No hay conexión con el asistente. Revisa tu internet e inténtalo de nuevo.");
    if ("error" in r) return setError(r.error);
    const item: MemoryItem = r.memory ?? { id: crypto.randomUUID(), question: p, answer: r.respuesta, origin: r.origen, amounts: r.importes, createdAt: new Date().toISOString() };
    if (closingId && !isUser) setHistorial(guestMemory.add(closingId, item));
    else setHistorial((h) => [...h, item]);
    setPregunta("");
  }

  const hilo = useRef<HTMLDivElement>(null);
  useEffect(() => { // la conversación baja sola: el hilo se desplaza, no la página
    const el = hilo.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [historial.length, pendiente, auto.texto]);

  const etiqueta = (o: MemoryItem["origin"]) => (o === "modelo" ? "VendIA" : "Resumen automático");
  const escuchar = (id: string, texto: string, rotulo: string) =>
    voz.leyendo === id ? (
      <button key={id} type="button" className="btn-voz activo" onClick={voz.parar} aria-label="Detener la lectura">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
        Detener
      </button>
    ) : (
      <button key={id} type="button" className="btn-voz" onClick={() => voz.leer(id, texto)} aria-label={rotulo}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" fill="currentColor" /></svg>
        {rotulo === "Escuchar resultado" ? rotulo : "Escuchar"}
      </button>
    );

  const campo = `pregunta-${closingId ?? "vivo"}`;
  return (
    <section className="chat" aria-label="Asistente VendIA">
      <header className="chat-cab">
        <span className="chat-icono" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 11l.9 2.6L22.5 16.5l-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z" fill="currentColor" /></svg>
        </span>
        <div>
          <h2>Asistente VendIA</h2>
          <p className="chat-estado" data-testid="asistente-origen" role="status">
            {auto.cargando ? <><span className="punto" aria-hidden /> Generando explicación…</> : auto.aviso ? auto.aviso : auto.origen === "modelo" ? "Responde con el modelo de NVIDIA" : "Resumen calculado en la app"}
          </p>
        </div>
      </header>

      <div className="chat-hilo" ref={hilo} aria-label="Conversación" aria-live="polite" data-testid="historial" tabIndex={0}>
        <div className="msg asistente">
          <p data-testid="asistente-auto">{auto.texto}</p>
          {voz.soportada ? escuchar("auto", auto.texto, "Escuchar resultado") : <p className="chat-nota" role="status">Tu navegador no admite lectura en voz alta.</p>}
        </div>
        {historial.map((m) => (
          <div key={m.id} className="par">
            <div className="msg usuario"><p>{m.question}</p></div>
            <div className="msg asistente">
              <p>{m.answer}</p>
              <span className="msg-pie">{etiqueta(m.origin)}{voz.soportada && escuchar(m.id, m.answer, "Escuchar respuesta")}</span>
            </div>
          </div>
        ))}
        {pendiente && <div className="msg asistente escribiendo" role="status" aria-label="VendIA está respondiendo"><i /><i /><i /></div>}
        {error && <p className="chat-error" role="alert">{error}</p>}
      </div>

      <form className="chat-form" onSubmit={preguntar}>
        <label htmlFor={campo} className="sr-only">Pregunta sobre las monedas, las cantidades o el total</label>
        <input id={campo} placeholder="Pregunta sobre tus monedas…" value={pregunta} maxLength={240} autoComplete="off" disabled={pendiente} onChange={(e) => setPregunta(e.target.value)} />
        <button className="chat-enviar" disabled={pendiente || !pregunta.trim()} aria-label={pendiente ? "Consultando" : "Enviar pregunta"}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M3 20l18-8L3 4v6l11 2-11 2v6z" fill="currentColor" /></svg>
        </button>
      </form>
      {closingId && <p className="chat-nota">{isUser ? "La conversación se guarda en tu cuenta." : "La conversación se guarda solo en esta pestaña."}</p>}
    </section>
  );
}
