"use client";

import { useEffect, useState, type FormEvent } from "react";
import { guestMemory, type MemoryItem } from "@/lib/asistente-memoria";
import type { ClosingAnswer } from "@/lib/asistente";
import type { Closing } from "@/lib/caja/types";
import { useProfile } from "./ProfileProvider";

/**
 * Asistente del cierre con memoria del perfil activo: cuenta → Supabase (asociada a su usuario);
 * invitado → sessionStorage de la pestaña. Nunca se mezclan ni se importan entre sí.
 */
export default function PreguntarCierre({ closing }: { closing: Pick<Closing, "id" | "expectedCents" | "countedCents"> }) {
  const { profile } = useProfile();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<MemoryItem[]>([]);
  const [error, setError] = useState("");
  const isUser = profile.mode === "user";

  useEffect(() => {
    let vivo = true;
    if (!isUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- la memoria del invitado se lee de la pestaña
      setHistory(guestMemory.load(closing.id));
      return;
    }
    fetch(`/api/asistente/memoria?closingId=${closing.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => vivo && setHistory(d.items ?? []))
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [isUser, closing.id]);

  async function preguntar(event: FormEvent) {
    event.preventDefault();
    const pregunta = question.trim();
    if (pending || !pregunta) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/cierre/preguntar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isUser
            ? { closingId: closing.id, pregunta }
            : { importes: { expectedCents: closing.expectedCents, countedCents: closing.countedCents }, pregunta },
        ),
      });
      const data: (ClosingAnswer & { memory?: MemoryItem | null }) & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo consultar el cierre.");
      if (isUser) {
        // La cuenta recupera la conversación del servidor; si no se pudo guardar, se muestra igual la respuesta.
        const item = data.memory ?? { id: crypto.randomUUID(), question: pregunta, answer: data.respuesta, origin: data.origen, amounts: data.importes, createdAt: new Date().toISOString() };
        setHistory((h) => [...h, item]);
      } else {
        setHistory(guestMemory.add(closing.id, {
          id: crypto.randomUUID(), question: pregunta, answer: data.respuesta, origin: data.origen, amounts: data.importes, createdAt: new Date().toISOString(),
        }));
      }
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el cierre. Vuelve a intentarlo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={preguntar} className="expected" aria-label="Asistente del cierre">
      <label htmlFor="pregunta-cierre">Preguntar sobre mi cierre</label>
      <input id="pregunta-cierre" placeholder="¿Por qué falta efectivo?" value={question}
        maxLength={240} required disabled={pending} onChange={e => setQuestion(e.target.value)} />
      <button className="btn secondary" disabled={pending || !question.trim()}>
        {pending ? "Consultando…" : "Preguntar"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="history" aria-label="Conversación" aria-live="polite" data-testid="historial">
        {history.map((m) => (
          <li key={m.id}>
            <p className="q">{m.question}</p>
            <p className="a"><strong>{m.origin === "modelo" ? "Respuesta de Qwen" : "Resumen automático"}</strong> · {m.amounts} {m.answer}</p>
          </li>
        ))}
      </ul>
      <p className="muted">{isUser ? "La conversación se guarda en tu cuenta." : "La conversación se guarda solo en esta pestaña."}</p>
    </form>
  );
}
