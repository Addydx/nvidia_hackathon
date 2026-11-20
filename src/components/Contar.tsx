"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import type { Closing } from "@/lib/caja/types";
import { DENOMINATIONS, MAX_PHOTO_BYTES, type CoinCount, type Denomination } from "@/lib/vision";
import type { Conteo } from "@/lib/monedas-asistente";
import GuestBanner from "./GuestBanner";
import AsistenteMonedas from "./AsistenteMonedas";
import { useProfile } from "./ProfileProvider";

const emptyCounts = (): Record<Denomination, string> => ({ 1: "0", 2: "0", 5: "0", 10: "0" });

/** Entero entre 0 y 99,999; null si el texto no es válido (incluido vacío). */
const parseCount = (t: string): number | null => (/^\d{1,5}$/.test(t.trim()) ? Number(t.trim()) : null);

const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** Pantalla principal: contar monedas con una foto, revisar el conteo, guardarlo y preguntarle al asistente. */
export default function Contar() {
  const { ready, profile, api } = useProfile();
  const [history, setHistory] = useState<Closing[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const run = useRef<AbortController | null>(null);

  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState<CoinCount | null>(null); // lo que leyó la foto (para saber si el usuario corrigió)
  const [fotoId, setFotoId] = useState(0); // una foto nueva reinicia el asistente: no se mezclan resultados
  const [edit, setEdit] = useState<Record<Denomination, string>>(emptyCounts);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveId = useRef<string | null>(null); // llave de idempotencia: un reintento no duplica el conteo
  const sending = useRef(false);

  useEffect(() => {
    if (!foto) return;
    const url = URL.createObjectURL(foto);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la vista previa depende del archivo elegido
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  useEffect(() => () => run.current?.abort(), []);

  const load = useCallback(async () => {
    if (!api) return;
    setLoadError(null);
    const r = await api<{ closings: Closing[] }>("/api/conteos");
    if (r.ok) setHistory(r.data.closings);
    else setLoadError(r.error);
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del perfil activo
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
      const res = await fetch("/api/cierre/analizar", { method: "POST", body, signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(90_000)]) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo analizar la foto.");
      if (run.current === ctrl) {
        const c = data.conteo as CoinCount;
        // la lectura de la foto es solo una propuesta: el usuario la revisa y corrige
        setEdit({ 1: String(c[1]), 2: String(c[2]), 5: String(c[5]), 10: String(c[10]) });
        setOriginal(c);
        setFotoId((n) => n + 1);
        setEditing(true);
        setSaveError(null);
        saveId.current = null;
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
    setOriginal(null);
    setEditing(false); // el resultado anterior se oculta hasta que llegue el de la foto nueva
    void analizar(f); // el análisis empieza en cuanto se elige la foto
  }

  const parsed = DENOMINATIONS.map((d) => parseCount(edit[d]));
  const valid = parsed.every((n) => n !== null);
  const totalCents = valid ? DENOMINATIONS.reduce((sum, d, i) => sum + d * (parsed[i] as number), 0) * 100 : 0;
  const conteoVivo: Conteo | null = valid ? ({ 1: parsed[0] as number, 2: parsed[1] as number, 5: parsed[2] as number, 10: parsed[3] as number }) : null;
  const corregido = !!original && valid && DENOMINATIONS.some((m, i) => (parsed[i] as number) !== original[m]);
  const ajustar = (m: Denomination, delta: number) => {
    saveId.current = null;
    setEdit((p) => {
      const n = parseCount(p[m]);
      return { ...p, [m]: String(Math.min(99999, Math.max(0, (n ?? 0) + delta))) };
    });
  };

  async function guardar() {
    if (!valid || sending.current || !api) return;
    sending.current = true;
    setSaving(true);
    setSaveError(null);
    const id = (saveId.current ??= crypto.randomUUID());
    const coins = Object.fromEntries(DENOMINATIONS.map((d, i) => [d, parsed[i]]));
    const r = await api<{ closing: Closing }>("/api/conteos", { method: "POST", body: JSON.stringify({ id, coins, expectedCents: null }) });
    sending.current = false;
    setSaving(false);
    if (!r.ok) return setSaveError(r.status === 0 ? "Sin conexión. Reintenta: no se duplicará el conteo." : r.error);
    setHistory((h) => [r.data.closing, ...h.filter((c) => c.id !== r.data.closing.id)]);
    saveId.current = null;
    setEditing(false);
    setOriginal(null);
    setEdit(emptyCounts());
    setFoto(null);
    setPreview(null);
  }

  const last = history[0] ?? null;
  const older = history.slice(1, 11);

  return (
    <main className="screen">
      <header className="marca">
        <span className="marca-logo" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M8 12.5l2.7 2.7L16.5 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <h1>VendIA</h1>
          <p className="muted">Cuenta tus monedas con una foto</p>
        </div>
      </header>

      <div className="photo-actions">
        <label className="btn primary file-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M9 4l-1.8 2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.2L15 4H9zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" fill="currentColor" /></svg>
          Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={elegir} />
        </label>
        <label className="btn secondary file-btn">
          Elegir foto
          <input type="file" accept="image/*" onChange={elegir} />
        </label>
      </div>

      {(preview && foto) || analyzing ? (
        <figure className={`foto${analyzing ? " analizando" : ""}`}>
          {preview && foto && (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            <img className="preview" src={preview} alt="Vista previa de la foto de monedas" />
          )}
          {analyzing && <figcaption className="notice" role="status"><span className="punto" aria-hidden /> Analizando foto…</figcaption>}
        </figure>
      ) : (
        <p className="notice" role="status" />
      )}
      <p className="error" role="alert">{error}</p>

      {foto && error && !analyzing && <button className="btn primary" onClick={() => void analizar(foto)}>Reintentar</button>}
      {!editing && !analyzing && (
        <button className="btn-quiet" onClick={() => { setEditing(true); saveId.current = null; }}>Contar a mano</button>
      )}

      {editing && (
        <section className="resultado" aria-label="Conteo de monedas">
          <div className="total-hero">
            <span className="label">Total detectado</span>
            <strong data-testid="total">{valid ? formatCents(totalCents) : "—"}</strong>
            <span className="muted">MXN</span>
          </div>
          <ul className="coins" aria-label="Monedas por denominación">
            {DENOMINATIONS.map((m, i) => (
              <li key={m} className={parsed[i] ? "hay" : undefined}>
                <label htmlFor={`coin-${m}`} className="coin-chip">${m}</label>
                <div className="stepper">
                  <button type="button" aria-label={`Quitar una moneda de ${m} pesos`} onClick={() => ajustar(m, -1)}>−</button>
                  <input id={`coin-${m}`} data-testid={`coin-${m}`} className="coin-input" inputMode="numeric" autoComplete="off"
                    value={edit[m]} aria-invalid={parsed[i] === null}
                    onChange={(e) => { saveId.current = null; setEdit((p) => ({ ...p, [m]: e.target.value })); }} />
                  <button type="button" aria-label={`Añadir una moneda de ${m} pesos`} onClick={() => ajustar(m, 1)}>+</button>
                </div>
                <span className="sub">{parsed[i] === null ? "—" : formatCents(m * (parsed[i] as number) * 100)}</span>
              </li>
            ))}
          </ul>
          {!valid && <p className="error" role="alert">Escribe un número entero de monedas (0 a 99999) en cada fila.</p>}
          <p className="error" role="alert">{saveError}</p>
          <button className="btn primary" disabled={!valid || saving || analyzing} onClick={() => void guardar()}>
            {saving ? "Guardando…" : saveError ? "Reintentar guardado" : "Guardar conteo"}
          </button>
        </section>
      )}

      {editing && conteoVivo && <AsistenteMonedas key={`vivo-${fotoId}`} conteo={conteoVivo} corregido={corregido} />}

      {ready && profile.mode === "guest" && <GuestBanner />}
      {loadError && <p className="error" role="alert">{loadError}</p>}

      {last && !editing && (
        <>
          <section className="resultado" aria-label="Último conteo">
            <div className="total-hero">
              <span className="label">Último conteo · {fecha(last.closedAt)}</span>
              <strong data-testid="last-total">{formatCents(last.countedCents)}</strong>
              <span className="muted">{profile.mode === "guest" ? "Guardado solo en esta pestaña" : "Guardado en tu cuenta"}</span>
            </div>
            <ul className="coins resumen">
              {DENOMINATIONS.map((m) => (
                <li key={m} className={last.coins[m] ? "hay" : undefined}>
                  <span className="coin-chip">${m}</span>
                  <strong>{last.coins[m]}</strong>
                  <span className="sub">{formatCents(m * last.coins[m] * 100)}</span>
                </li>
              ))}
            </ul>
          </section>
          <AsistenteMonedas key={last.id} conteo={last.coins as Conteo} closingId={last.id} />
        </>
      )}

      {older.length > 0 && (
        <details className="historial">
          <summary>Historial ({older.length})</summary>
          <ul className="sales" data-testid="historial-conteos">
            {older.map((c) => (
              <li key={c.id}>
                <time dateTime={c.closedAt}>{fecha(c.closedAt)}</time>
                <span>{formatCents(c.countedCents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
