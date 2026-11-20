"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import { DENOMINATIONS, MAX_PHOTO_BYTES, subtotal, totalPesos, type CoinCount } from "@/lib/vision";

export default function Cierre() {
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [conteo, setConteo] = useState<CoinCount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const run = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!foto) return;
    const url = URL.createObjectURL(foto);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista previa depende del archivo elegido
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  useEffect(() => () => run.current?.abort(), []);

  async function analizar(f: File) {
    run.current?.abort(); // una foto nueva cancela el análisis anterior
    const ctrl = new AbortController();
    run.current = ctrl;
    setAnalyzing(true);
    setError(null);
    setConteo(null);
    try {
      const body = new FormData();
      body.append("foto", f);
      const res = await fetch("/api/cierre/analizar", {
        method: "POST",
        body,
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(90_000)]),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo analizar la foto.");
      if (run.current === ctrl) setConteo(data.conteo as CoinCount);
    } catch (e) {
      if (ctrl.signal.aborted) return; // reemplazado por otra foto o desmontado
      setError(e instanceof Error && e.name !== "TimeoutError" && e.name !== "TypeError" ? e.message : "Sin conexión con el servidor.");
    } finally {
      if (run.current === ctrl) setAnalyzing(false);
    }
  }

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Elige un archivo de imagen.");
    if (f.size > MAX_PHOTO_BYTES) return setError("La foto pesa más de 10 MB. Toma o elige otra.");
    setFoto(f);
    void analizar(f); // el análisis empieza en cuanto se elige la foto
  }

  const total = conteo ? totalPesos(conteo) : 0;

  return (
    <main className="screen">
      <header>
        <h1>Cierre</h1>
        <p className="muted">Sube una foto con las monedas separadas.</p>
      </header>

      <div className="photo-actions">
        <label className="btn secondary file-btn">
          Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={elegir} />
        </label>
        <label className="btn secondary file-btn">
          Elegir foto
          <input type="file" accept="image/*" onChange={elegir} />
        </label>
      </div>

      {preview && foto && (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
        <img className="preview" src={preview} alt="Vista previa de la foto de monedas" />
      )}

      <p className="notice" role="status">{analyzing ? "Analizando foto…" : null}</p>
      <p className="error" role="alert">{error}</p>

      {foto && error && !analyzing && (
        <button className="btn primary" onClick={() => void analizar(foto)}>Reintentar</button>
      )}

      {conteo && (
        <section className="expected" aria-label="Resultado del conteo">
          <span className="label">Monedas encontradas</span>
          <ul className="coins">
            {DENOMINATIONS.map((d) => (
              <li key={d}>
                <span>${d}</span>
                <strong data-testid={`coin-${d}`}>{conteo[d]}</strong>
                <span className="sub">{formatCents(subtotal(conteo, d) * 100)}</span>
              </li>
            ))}
          </ul>
          <div className="total">
            <span className="label">Total</span>
            <strong data-testid="total">{formatCents(total * 100)}</strong>
          </div>
        </section>
      )}
    </main>
  );
}
