"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeDifference, formatCents, parsePesosToCents } from "@/lib/money";
import type { Closing } from "@/lib/caja/types";
import { DENOMINATIONS, MAX_PHOTO_BYTES, type CoinCount, type Denomination } from "@/lib/vision";
import GuestBanner from "./GuestBanner";
import PreguntarCierre from "./PreguntarCierre";
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
  const [edit, setEdit] = useState<Record<Denomination, string>>(emptyCounts);
  const [expectedInput, setExpectedInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveId = useRef<string | null>(null); // llave de idempotencia: un reintento no duplica el conteo
  const sending = useRef(false);

  const [lateExpected, setLateExpected] = useState("");
  const [lateError, setLateError] = useState<string | null>(null);
  const [lateBusy, setLateBusy] = useState(false);

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
    void analizar(f); // el análisis empieza en cuanto se elige la foto
  }

  const parsed = DENOMINATIONS.map((d) => parseCount(edit[d]));
  const valid = parsed.every((n) => n !== null);
  const totalCents = valid ? DENOMINATIONS.reduce((sum, d, i) => sum + d * (parsed[i] as number), 0) * 100 : 0;
  const expectedCents = expectedInput.trim() === "" ? null : parsePesosToCents(expectedInput);
  const expectedInvalid = expectedInput.trim() !== "" && expectedCents === null;
  const diff = valid && expectedCents !== null ? describeDifference(totalCents - expectedCents) : null;

  async function guardar() {
    if (!valid || expectedInvalid || sending.current || !api) return;
    sending.current = true;
    setSaving(true);
    setSaveError(null);
    const id = (saveId.current ??= crypto.randomUUID());
    const coins = Object.fromEntries(DENOMINATIONS.map((d, i) => [d, parsed[i]]));
    const r = await api<{ closing: Closing }>("/api/conteos", { method: "POST", body: JSON.stringify({ id, coins, expectedCents }) });
    sending.current = false;
    setSaving(false);
    if (!r.ok) return setSaveError(r.status === 0 ? "Sin conexión. Reintenta: no se duplicará el conteo." : r.error);
    setHistory((h) => [r.data.closing, ...h.filter((c) => c.id !== r.data.closing.id)]);
    saveId.current = null;
    setEditing(false);
    setEdit(emptyCounts());
    setExpectedInput("");
    setFoto(null);
    setPreview(null);
  }

  async function indicarEsperado(c: Closing) {
    const cents = parsePesosToCents(lateExpected);
    if (cents === null) return setLateError("Escribe un importe válido, por ejemplo 150 o 150.50");
    if (!api || lateBusy) return;
    setLateBusy(true);
    setLateError(null);
    const r = await api<{ closing: Closing }>("/api/conteos/esperado", { method: "POST", body: JSON.stringify({ closingId: c.id, expectedCents: cents }) });
    setLateBusy(false);
    if (!r.ok) return setLateError(r.error);
    setHistory((h) => h.map((x) => (x.id === c.id ? r.data.closing : x)));
    setLateExpected("");
  }

  const last = history[0] ?? null;
  const older = history.slice(1, 11);
  const d = last && last.differenceCents !== null ? describeDifference(last.differenceCents) : null;

  return (
    <main className="screen">
      <header>
        <h1>Cuenta tus monedas</h1>
        <p className="muted">Toma una foto con las monedas separadas.</p>
      </header>

      <div className="photo-stack">
        <label className="btn primary file-btn big">
          Tomar foto
          <input type="file" accept="image/*" capture="environment" onChange={elegir} />
        </label>
        <label className="btn secondary file-btn">
          Elegir foto
          <input type="file" accept="image/*" onChange={elegir} />
        </label>
      </div>

      <p className="notice" role="status">{analyzing ? "Analizando foto…" : null}</p>
      <p className="error" role="alert">{error}</p>

      {foto && error && !analyzing && <button className="btn primary" onClick={() => void analizar(foto)}>Reintentar</button>}
      {!editing && (
        <button className="btn-quiet" onClick={() => { setEditing(true); saveId.current = null; }}>Contar a mano</button>
      )}

      {preview && foto && (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
        <img className="preview" src={preview} alt="Vista previa de la foto de monedas" />
      )}

      {editing && (
        <section className="expected" aria-label="Conteo de monedas">
          <span className="label">Monedas contadas (revisa y corrige)</span>
          <ul className="coins">
            {DENOMINATIONS.map((m, i) => (
              <li key={m}>
                <label htmlFor={`coin-${m}`}>${m}</label>
                <input id={`coin-${m}`} data-testid={`coin-${m}`} className="coin-input" inputMode="numeric" autoComplete="off"
                  value={edit[m]} aria-invalid={parsed[i] === null}
                  onChange={(e) => { saveId.current = null; setEdit((p) => ({ ...p, [m]: e.target.value })); }} />
                <span className="sub">{parsed[i] === null ? "—" : formatCents(m * (parsed[i] as number) * 100)}</span>
              </li>
            ))}
          </ul>
          {!valid && <p className="error" role="alert">Escribe un número entero de monedas (0 a 99999) en cada fila.</p>}
          <div className="total">
            <span className="label">Total</span>
            <strong data-testid="total">{valid ? formatCents(totalCents) : "—"}</strong>
          </div>

          <label htmlFor="esperado">Efectivo esperado (opcional)</label>
          <div className="money-input">
            <span aria-hidden>$</span>
            <input id="esperado" data-testid="esperado" inputMode="decimal" autoComplete="off" placeholder="0.00" value={expectedInput}
              aria-invalid={expectedInvalid} onChange={(e) => { saveId.current = null; setExpectedInput(e.target.value); }} />
          </div>
          {expectedInvalid && <p className="error" role="alert">Escribe un importe válido, por ejemplo 150 o 150.50</p>}
          {diff && (
            <div className="total">
              <span className="label">Diferencia</span>
              <strong data-testid="difference" data-kind={diff.kind}>{diff.label}</strong>
            </div>
          )}

          <p className="error" role="alert">{saveError}</p>
          <button className="btn primary" disabled={!valid || expectedInvalid || saving || analyzing} onClick={() => void guardar()}>
            {saving ? "Guardando…" : saveError ? "Reintentar guardado" : "Guardar conteo"}
          </button>
        </section>
      )}

      {ready && profile.mode === "guest" && <GuestBanner />}
      {loadError && <p className="error" role="alert">{loadError}</p>}

      {last && (
        <section className="expected" aria-label="Último conteo">
          <span className="label">Último conteo · {fecha(last.closedAt)}</span>
          <ul className="coins">
            {DENOMINATIONS.map((m) => (
              <li key={m}>
                <span>${m}</span>
                <strong>{last.coins[m]}</strong>
                <span className="sub">{formatCents(m * last.coins[m] * 100)}</span>
              </li>
            ))}
          </ul>
          <div className="total">
            <span className="label">Total contado</span>
            <strong data-testid="last-total">{formatCents(last.countedCents)}</strong>
          </div>
          {last.expectedCents !== null && d ? (
            <>
              <div className="total">
                <span className="label">Efectivo esperado</span>
                <strong data-testid="last-expected">{formatCents(last.expectedCents)}</strong>
              </div>
              <div className="total">
                <span className="label">Diferencia</span>
                <strong data-testid="last-difference" data-kind={d.kind}>{d.label}</strong>
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void indicarEsperado(last); }} className="late-expected">
              <label htmlFor="esperado-tarde">¿Quieres calcular una diferencia? Indica el efectivo esperado</label>
              <div className="money-input">
                <span aria-hidden>$</span>
                <input id="esperado-tarde" inputMode="decimal" autoComplete="off" placeholder="0.00" value={lateExpected}
                  onChange={(e) => setLateExpected(e.target.value)} />
              </div>
              <p className="error" role="alert">{lateError}</p>
              <button className="btn secondary" disabled={lateBusy || !lateExpected.trim()}>{lateBusy ? "Calculando…" : "Calcular diferencia"}</button>
            </form>
          )}
          <p className="muted">{profile.mode === "guest" ? "Guardado solo en esta pestaña." : "Guardado en tu cuenta."}</p>
        </section>
      )}

      {last && <PreguntarCierre key={last.id} closing={last} />}

      {older.length > 0 && (
        <section aria-label="Historial">
          <h2>Historial</h2>
          <ul className="sales" data-testid="historial-conteos">
            {older.map((c) => (
              <li key={c.id}>
                <time dateTime={c.closedAt}>{fecha(c.closedAt)}</time>
                <span>
                  {formatCents(c.countedCents)}
                  {c.differenceCents !== null ? ` · ${describeDifference(c.differenceCents).label}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
