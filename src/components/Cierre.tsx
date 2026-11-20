"use client";

import { useEffect, useRef, useState } from "react";
import { DENOMINATIONS, MAX_PHOTO_BYTES, type CoinCount } from "@/lib/vision";

export default function Cierre() {
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [conteo, setConteo] = useState<CoinCount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!foto) return;
    const url = URL.createObjectURL(foto);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista previa depende del archivo elegido
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!f) return;
    setConteo(null);
    setFailed(false);
    if (!f.type.startsWith("image/")) return setError("Elige un archivo de imagen.");
    if (f.size > MAX_PHOTO_BYTES) return setError("La foto pesa más de 10 MB. Toma o elige otra.");
    setError(null);
    setFoto(f);
  }

  async function analizar() {
    if (!foto || inFlight.current) return;
    inFlight.current = true;
    setAnalyzing(true);
    setError(null);
    setConteo(null);
    try {
      const body = new FormData();
      body.append("foto", foto);
      const res = await fetch("/api/cierre/analizar", { method: "POST", body, signal: AbortSignal.timeout(90_000) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo analizar la foto.");
      setConteo(data.conteo as CoinCount);
      setFailed(false);
    } catch (e) {
      setFailed(true);
      setError(e instanceof Error && e.name !== "TimeoutError" && e.name !== "TypeError" ? e.message : "Sin conexión con el servidor.");
    } finally {
      inFlight.current = false;
      setAnalyzing(false);
    }
  }

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

      {foto && (
        <button className="btn primary" onClick={() => void analizar()} disabled={analyzing}>
          {analyzing ? "Analizando…" : failed ? "Reintentar" : "Analizar foto"}
        </button>
      )}

      <p className="error" role="alert">{error}</p>

      {conteo && (
        <section className="expected" aria-label="Conteo de monedas">
          <span className="label">Monedas encontradas</span>
          <ul className="coins">
            {DENOMINATIONS.map((d) => (
              <li key={d}><span>${d}</span><strong data-testid={`coin-${d}`}>{conteo[d]}</strong></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
