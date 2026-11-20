"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { describeDifference, formatCents } from "@/lib/money";
import type { CajaState, Closing } from "@/lib/caja/types";
import { DENOMINATIONS, MAX_PHOTO_BYTES, type CoinCount, type Denomination } from "@/lib/vision";

const emptyCounts = (): Record<Denomination, string> => ({ 1: "0", 2: "0", 5: "0", 10: "0" });

/** Entero entre 0 y 99,999; null si el texto no es válido (incluido vacío). */
const parseCount = (t: string): number | null => (/^\d{1,5}$/.test(t.trim()) ? Number(t.trim()) : null);

export default function Cierre() {
  const [caja, setCaja] = useState<CajaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<Denomination, string>>(emptyCounts);
  const [saving, setSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Closing | null>(null);
  const sending = useRef(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/caja", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) return void window.location.replace("/acceso");
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar la caja.");
      setCaja(body.state as CajaState | null);
    } catch (e) {
      setLoadError(e instanceof Error && e.name !== "TimeoutError" && e.name !== "TypeError" ? e.message : "Sin conexión con el servidor.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void load();
  }, [load]);

  async function analizar(f: File) {
    run.current?.abort(); // una foto nueva cancela el análisis anterior
    const ctrl = new AbortController();
    run.current = ctrl;
    setAnalyzing(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("foto", f);
      const res = await fetch("/api/cierre/analizar", {
        method: "POST",
        body,
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(90_000)]),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return void window.location.replace("/acceso");
      if (!res.ok) throw new Error(data?.error ?? "No se pudo analizar la foto.");
      if (run.current === ctrl) {
        const c = data.conteo as CoinCount;
        // la lectura de la foto es solo una propuesta: el usuario la revisa y corrige
        setEdit({ 1: String(c[1]), 2: String(c[2]), 5: String(c[5]), 10: String(c[10]) });
        setConfirmError(null);
      }
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

  const parsed = DENOMINATIONS.map((d) => parseCount(edit[d]));
  const valid = parsed.every((n) => n !== null);
  // Vista previa del cierre. El servidor vuelve a calcular todo al confirmar.
  const countedCents = valid ? DENOMINATIONS.reduce((sum, d, i) => sum + d * (parsed[i] as number), 0) * 100 : 0;
  const diff = caja && valid ? describeDifference(countedCents - caja.expectedCents) : null;

  async function confirmar() {
    if (!caja || !valid || sending.current) return;
    sending.current = true;
    setSaving(true);
    setConfirmError(null);
    try {
      const coins = Object.fromEntries(DENOMINATIONS.map((d, i) => [d, parsed[i]]));
      const res = await fetch("/api/cierre/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: caja.session.id, coins }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) return void window.location.replace("/acceso");
      if (!res.ok) throw new Error(body?.error ?? "No se pudo confirmar el cierre.");
      setClosing(body.closing as Closing);
    } catch (e) {
      // Reintentar con la misma caja recupera el mismo cierre si ya se había guardado.
      setConfirmError(e instanceof Error && e.name !== "TimeoutError" && e.name !== "TypeError" ? e.message : "Sin conexión. Reintenta: no se duplicará el cierre.");
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  if (loading) return <main className="screen"><p className="muted" role="status">Cargando caja…</p></main>;

  if (loadError)
    return (
      <main className="screen">
        <h1>Cierre</h1>
        <p className="error" role="alert">{loadError}</p>
        <button className="btn secondary" onClick={() => void load()}>Reintentar</button>
      </main>
    );

  if (closing) {
    const d = describeDifference(closing.differenceCents);
    return (
      <main className="screen">
        <header>
          <h1>Caja cerrada</h1>
          <p className="muted">Cierre guardado.</p>
        </header>
        <section className="expected" aria-label="Resultado del cierre">
          <ul className="coins">
            {DENOMINATIONS.map((m) => (
              <li key={m}>
                <span>${m}</span>
                <strong>{closing.coins[m]}</strong>
                <span className="sub">{formatCents(m * closing.coins[m] * 100)}</span>
              </li>
            ))}
          </ul>
          <div className="total">
            <span className="label">Efectivo esperado</span>
            <strong data-testid="closed-expected">{formatCents(closing.expectedCents)}</strong>
          </div>
          <div className="total">
            <span className="label">Efectivo contado</span>
            <strong data-testid="closed-counted">{formatCents(closing.countedCents)}</strong>
          </div>
          <div className="total">
            <span className="label">Diferencia</span>
            <strong data-testid="closed-difference" data-kind={d.kind}>{d.label}</strong>
          </div>
          <p className="muted" data-testid="closed-difference-cents">Diferencia: {closing.differenceCents} centavos</p>
        </section>
        <Link className="btn secondary file-btn" href="/">Abrir otra caja</Link>
      </main>
    );
  }

  if (!caja)
    return (
      <main className="screen">
        <h1>Cierre</h1>
        <p className="muted">No hay una caja abierta. Abre una caja para poder cerrarla.</p>
        <Link className="btn primary file-btn" href="/">Ir a Caja</Link>
      </main>
    );

  return (
    <main className="screen">
      <header>
        <h1>Cierre</h1>
        <p className="muted">Sube una foto con las monedas separadas.</p>
      </header>

      <section className="expected" aria-label="Efectivo esperado">
        <span className="label">Efectivo esperado</span>
        <strong data-testid="expected">{formatCents(caja.expectedCents)}</strong>
      </section>

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

      <section className="expected" aria-label="Conteo de monedas">
        <span className="label">Monedas contadas (revisa y corrige)</span>
        <ul className="coins">
          {DENOMINATIONS.map((d, i) => (
            <li key={d}>
              <label htmlFor={`coin-${d}`}>${d}</label>
              <input
                id={`coin-${d}`}
                data-testid={`coin-${d}`}
                className="coin-input"
                inputMode="numeric"
                autoComplete="off"
                value={edit[d]}
                aria-invalid={parsed[i] === null}
                onChange={(e) => setEdit((prev) => ({ ...prev, [d]: e.target.value }))}
              />
              <span className="sub">{parsed[i] === null ? "—" : formatCents(d * (parsed[i] as number) * 100)}</span>
            </li>
          ))}
        </ul>
        {!valid && <p className="error" role="alert">Escribe un número entero de monedas (0 a 99999) en cada fila.</p>}
        <div className="total">
          <span className="label">Efectivo contado</span>
          <strong data-testid="counted">{valid ? formatCents(countedCents) : "—"}</strong>
        </div>
        {diff && (
          <div className="total">
            <span className="label">Diferencia</span>
            <strong data-testid="difference" data-kind={diff.kind}>{diff.label}</strong>
          </div>
        )}
        {valid && caja && (
          <p className="muted" data-testid="difference-cents">Contado menos esperado: {countedCents - caja.expectedCents} centavos</p>
        )}
      </section>

      <p className="error" role="alert">{confirmError}</p>
      <button className="btn primary" disabled={!valid || saving || analyzing} onClick={() => void confirmar()}>
        {saving ? "Confirmando…" : confirmError ? "Reintentar cierre" : "Confirmar cierre"}
      </button>
    </main>
  );
}
