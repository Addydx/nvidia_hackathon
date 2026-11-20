"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents, parsePesosToCents } from "@/lib/money";
import type { CajaState } from "@/lib/caja/types";
import { profileKey, type Profile } from "@/lib/caja/transport";
import GuestBanner from "./GuestBanner";
import { useProfile } from "./ProfileProvider";

type Pending = { id: string; sessionId: string; amountCents: number; error?: string; definitive?: boolean };

/** La venta pendiente se guarda por perfil: invitado → sessionStorage de la pestaña; cuenta → localStorage con su id. */
const pendingStore = (p: Profile) => ({
  storage: p.mode === "user" ? window.localStorage : window.sessionStorage,
  key: `caja.pending.${profileKey(p)}`,
});

function readPending(p: Profile): Pending | null {
  try {
    const { storage, key } = pendingStore(p);
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}
function writePending(p: Profile, v: Pending | null) {
  try {
    const { storage, key } = pendingStore(p);
    if (v) storage.setItem(key, JSON.stringify(v));
    else storage.removeItem(key);
  } catch {
    /* sin almacenamiento: el importe sigue en memoria */
  }
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

export default function Caja() {
  const { ready, profile, api } = useProfile();
  const [state, setState] = useState<CajaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingInput, setOpeningInput] = useState("");
  const [saleInput, setSaleInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setLoadError(null);
    const r = await api<{ state: CajaState | null }>("/api/caja");
    if (!r.ok) {
      setLoadError(r.error);
    } else {
      setState(r.data.state);
      const p = readPending(profile);
      const stale = !p || !r.data.state || p.sessionId !== r.data.state.session.id || r.data.state.sales.some((s) => s.id === p.id);
      if (stale) writePending(profile, null);
      setPending(stale ? null : p);
    }
    setLoading(false);
  }, [api, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void load();
  }, [load]);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    const cents = parsePesosToCents(openingInput);
    if (cents === null) return setFormError("Escribe un importe válido, por ejemplo 20 o 20.50");
    setFormError(null);
    setSaving(true);
    const r = await api!<{ state: CajaState }>("/api/caja/abrir", { method: "POST", body: JSON.stringify({ openingCents: cents }) });
    setSaving(false);
    if (!r.ok) return setFormError(r.error);
    setState(r.data.state);
    setOpeningInput("");
  }

  async function enviar(p: Pending) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setNotice(null);
    const r = await api!<{ state: CajaState }>("/api/caja/ventas", {
      method: "POST",
      body: JSON.stringify({ id: p.id, sessionId: p.sessionId, amountCents: p.amountCents }),
    });
    inFlight.current = false;
    setSaving(false);
    if (r.ok) {
      writePending(profile, null);
      setPending(null);
      setState(r.data.state);
      setSaleInput("");
      setNotice("Venta guardada");
    } else {
      const failed = { ...p, error: r.error, definitive: r.status >= 400 && r.status < 500 };
      writePending(profile, failed);
      setPending(failed);
    }
  }

  function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!state || pending) return;
    const cents = parsePesosToCents(saleInput);
    if (cents === null || cents <= 0) return setFormError("Escribe un importe de venta válido, por ejemplo 10 o 10.50");
    setFormError(null);
    const p: Pending = { id: crypto.randomUUID(), sessionId: state.session.id, amountCents: cents };
    writePending(profile, p);
    setPending(p);
    void enviar(p);
  }

  function descartar() {
    writePending(profile, null);
    setPending(null);
    setSaleInput("");
  }

  async function eliminar() {
    if (!state || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const r = await api!<{ deletedSales: number }>("/api/caja/limpiar", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.session.id }),
    });
    setDeleting(false);
    // 404: la caja ya no existe (borrada antes); el resultado es el mismo.
    if (!r.ok && r.status !== 404) return setDeleteError(r.error);
    writePending(profile, null);
    setPending(null);
    setSaleInput("");
    setNotice(null);
    setFormError(null);
    setConfirmingDelete(false);
    setState(null); // vuelve a la pantalla de abrir caja
  }

  if (!ready || loading) return <main className="screen"><p className="muted" role="status">Cargando caja…</p></main>;

  if (loadError)
    return (
      <main className="screen">
        <h1>Caja</h1>
        <p className="error" role="alert">{loadError}</p>
        <button className="btn secondary" onClick={() => void load()}>Reintentar</button>
      </main>
    );

  if (!state)
    return (
      <main className="screen">
        <h1>Caja</h1>
        {profile.mode === "guest" && <GuestBanner />}
        <p className="muted">Abre tu caja con el dinero inicial para dar cambio.</p>
        <form onSubmit={abrir} noValidate>
          <label htmlFor="opening">Dinero inicial para cambio</label>
          <div className="money-input">
            <span aria-hidden>$</span>
            <input id="opening" inputMode="decimal" autoComplete="off" placeholder="0.00" value={openingInput}
              onChange={(e) => setOpeningInput(e.target.value)} aria-invalid={!!formError} aria-describedby="form-error" />
          </div>
          <p id="form-error" className="error" role="alert">{formError}</p>
          <button className="btn primary" disabled={saving}>{saving ? "Abriendo…" : "Abrir caja"}</button>
        </form>
      </main>
    );

  const sales = [...state.sales].reverse();
  return (
    <main className="screen">
      <header>
        <h1>Caja</h1>
        <p className="muted">Abierta a las {hora(state.session.openedAt)} · cambio inicial {formatCents(state.session.openingCents)}</p>
      </header>

      {profile.mode === "guest" && <GuestBanner />}

      <section className="expected" aria-label="Efectivo esperado">
        <span className="label">Efectivo esperado</span>
        <strong data-testid="expected">{formatCents(state.expectedCents)}</strong>
      </section>

      {pending ? (
        <section className={`pending${pending.error ? " failed" : ""}`} aria-label="Venta sin guardar">
          <p className="label">Venta sin guardar</p>
          <strong>{formatCents(pending.amountCents)}</strong>
          {pending.error && <p className="error" role="alert">{pending.error}. Tu importe se conservó.</p>}
          <button className="btn primary" onClick={() => void enviar(pending)} disabled={saving}>
            {saving ? "Guardando…" : "Reintentar"}
          </button>
          {pending.definitive && !saving && <button className="btn secondary" onClick={descartar}>Descartar</button>}
        </section>
      ) : (
        <form onSubmit={registrar} noValidate>
          <label htmlFor="sale">Venta en efectivo</label>
          <div className="money-input">
            <span aria-hidden>$</span>
            <input id="sale" inputMode="decimal" autoComplete="off" placeholder="0.00" value={saleInput}
              onChange={(e) => { setSaleInput(e.target.value); setNotice(null); }} aria-invalid={!!formError} aria-describedby="form-error" />
          </div>
          <p id="form-error" className="error" role="alert">{formError}</p>
          <button className="btn primary" disabled={saving}>Guardar venta</button>
        </form>
      )}

      <p className="notice" role="status">{notice}</p>

      <section aria-label="Ventas">
        <h2>Ventas ({sales.length})</h2>
        {sales.length === 0 ? (
          <p className="muted">Aún no hay ventas.</p>
        ) : (
          <ul className="sales">
            {sales.map((s) => (
              <li key={s.id}>
                <time dateTime={s.createdAt}>{hora(s.createdAt)}</time>
                <span>{formatCents(s.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmingDelete ? (
        <section className="pending failed" aria-label="Confirmar limpieza" role="alertdialog" aria-labelledby="del-title">
          <p id="del-title" className="label">¿Limpiar la caja?</p>
          <strong data-testid="delete-count">
            Se borrarán {sales.length} {sales.length === 1 ? "venta" : "ventas"} y la apertura.
          </strong>
          <p className="muted">Esta acción no se puede deshacer.</p>
          <p className="error" role="alert">{deleteError}</p>
          <button className="btn primary" onClick={() => void eliminar()} disabled={deleting}>
            {deleting ? "Limpiando…" : "Sí, limpiar"}
          </button>
          <button className="btn secondary" onClick={() => { setConfirmingDelete(false); setDeleteError(null); }} disabled={deleting}>
            Cancelar
          </button>
        </section>
      ) : (
        <button className="btn-quiet" onClick={() => setConfirmingDelete(true)}>Limpiar caja</button>
      )}
    </main>
  );
}
