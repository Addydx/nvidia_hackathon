"use client";

import { useState, type FormEvent } from "react";
import type { ClosingAnswer } from "@/lib/asistente";

export default function PreguntarCierre({ closingId }: { closingId: string }) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<ClosingAnswer | null>(null);
  const [error, setError] = useState("");
  async function preguntar(event: FormEvent) {
    event.preventDefault();
    if (pending || !question.trim()) return;
    setPending(true);
    setAnswer(null);
    setError("");
    try {
      const res = await fetch("/api/cierre/preguntar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingId, pregunta: question.trim() }),
      });
      const data = await res.json();
      if (res.ok) setAnswer(data);
      else setError(data.error ?? "No se pudo consultar el cierre.");
    } catch {
      setError("No se pudo consultar el cierre. Vuelve a intentarlo.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={preguntar} className="expected">
      <label htmlFor="pregunta-cierre">Preguntar sobre mi cierre</label>
      <input id="pregunta-cierre" placeholder="¿Por qué falta efectivo?" value={question}
        maxLength={240} required disabled={pending} onChange={e => setQuestion(e.target.value)} />
      <button className="btn secondary" disabled={pending || !question.trim()}>
        {pending ? "Consultando…" : "Preguntar"}
      </button>
      <div role="status">
        {answer && <><strong>{answer.origen === "modelo" ? "Respuesta de Qwen" : "Resumen automático"}</strong>
          <p>{answer.importes}</p><p>{answer.respuesta}</p></>}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
