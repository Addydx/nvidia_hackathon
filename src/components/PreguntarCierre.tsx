"use client";

import { useState } from "react";

export default function PreguntarCierre({ closingId }: { closingId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function preguntar() {
    setPending(true);
    setMessage("");
    try {
      const res = await fetch("/api/cierre/preguntar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingId }),
      });
      const data = await res.json();
      setMessage(res.ok ? data.respuesta : data.error ?? "No se pudo consultar el cierre.");
    } catch {
      setMessage("No se pudo consultar el cierre. Vuelve a intentarlo.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <button className="btn secondary" disabled={pending} onClick={preguntar}>
        {pending ? "Consultando…" : "Preguntar sobre mi cierre"}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
