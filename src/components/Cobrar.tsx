"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents, parsePesosToCents } from "@/lib/money";
import { MIN_CHARGE_CENTS } from "@/lib/cobros/constants";
import type { PublicPayment } from "@/lib/cobros/types";

type Config = {
  configured: boolean;
  mode: "test" | "live" | null;
  authorized: boolean;
  reason: string | null;
  connect: { enabled: boolean; connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };
};

const QUICK = [20, 50, 100, 200, 500];
const POLL_MS = 3000;
const TERMINAL = new Set(["paid", "failed", "expired"]);

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) window.location.replace("/acceso");
    if (res.ok) return { ok: true, data: body as T };
    return { ok: false, status: res.status, error: body?.error ?? "No se pudo completar la operación" };
  } catch {
    return { ok: false, status: 0, error: "Sin conexión con el servidor" };
  }
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const LABEL: Record<string, string> = { pending: "Esperando pago", processing: "Procesando", paid: "Pagado", failed: "Fallido", expired: "Vencido" };

export default function Cobrar() {
  const [config, setConfig] = useState<Config | null>(null);
  const [recent, setRecent] = useState<PublicPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [charge, setCharge] = useState<PublicPayment | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  // Mismo id para reintentar el mismo cobro (idempotencia); se renueva con «Nuevo cobro».
  const attemptId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const r = await api<{ payments: PublicPayment[]; config: Config }>("/api/cobros", { cache: "no-store" });
    if (!r.ok) setLoadError(r.error);
    else {
      setConfig(r.data.config);
      setRecent(r.data.payments);
      // Recupera un cobro en curso si se recargó la página.
      const live = r.data.payments.find((p) => (p.status === "pending" || p.status === "processing") && p.checkoutUrl && (!p.expiresAt || new Date(p.expiresAt) > new Date()));
      if (live) setCharge((cur) => cur ?? live);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void load();
  }, [load]);

  // Al volver del onboarding de Stripe Connect, consulta el estado real de la cuenta.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("connect") === "return") {
      void api<{ connect: Config["connect"] }>("/api/stripe/connect?refresh=1", { cache: "no-store" }).then((r) => {
        if (r.ok) setConfig((c) => (c ? { ...c, connect: r.data.connect } : c));
      });
    }
  }, []);

  // QR con la URL real de Checkout (generado en el navegador; la URL no sale a ningún tercero).
  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derivado de la URL del cobro
    if (!charge?.checkoutUrl) { setQr(null); return; }
    void import("qrcode")
      .then((m) => m.toDataURL(charge.checkoutUrl!, { width: 560, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }))
      .then((url) => vivo && setQr(url))
      .catch(() => vivo && setQr(null));
    return () => { vivo = false; };
  }, [charge?.checkoutUrl]);

  // Estado del cobro: consulta ligera al servidor (que a su vez refleja el estado real de Stripe).
  const chargeId = charge?.id;
  const chargeStatus = charge?.status;
  useEffect(() => {
    if (!chargeId || !chargeStatus || TERMINAL.has(chargeStatus)) return;
    let vivo = true;
    const tick = async () => {
      if (document.hidden) return;
      const r = await api<{ payment: PublicPayment }>(`/api/cobros/${chargeId}`, { cache: "no-store" });
      if (!vivo || !r.ok) return;
      setCharge(r.data.payment);
      if (TERMINAL.has(r.data.payment.status)) void load();
    };
    const t = setInterval(() => void tick(), POLL_MS);
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [chargeId, chargeStatus, load]);

  async function generar(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    const cents = parsePesosToCents(amountInput);
    if (cents === null || cents < MIN_CHARGE_CENTS) return setError("Escribe un importe válido de al menos $10.00");
    setError(null);
    setCreating(true);
    attemptId.current ??= crypto.randomUUID();
    const r = await api<{ payment: PublicPayment }>("/api/cobros", { method: "POST", body: JSON.stringify({ id: attemptId.current, amountCents: cents }) });
    setCreating(false);
    if (!r.ok) {
      // Un error definitivo (4xx) obliga a elegir otro importe; uno transitorio reintenta con el mismo id.
      if (r.status >= 400 && r.status < 500 && r.status !== 429) attemptId.current = null;
      return setError(r.error);
    }
    setCharge(r.data.payment);
    void load();
  }

  function nuevo() {
    attemptId.current = null;
    setCharge(null);
    setQr(null);
    setAmountInput("");
    setError(null);
    setCopied(null);
  }

  async function compartir() {
    if (!charge?.checkoutUrl) return;
    const text = `Paga ${formatCents(charge.amountCents)} aquí`;
    try {
      if (navigator.share) { await navigator.share({ title: "Cobro", text, url: charge.checkoutUrl }); return; }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(charge.checkoutUrl);
      setCopied("Enlace copiado");
    } catch {
      setCopied("No se pudo copiar; mantén pulsado el enlace");
    }
  }

  async function conectar() {
    setConnectBusy(true);
    setConnectMsg(null);
    const r = await api<{ url: string }>("/api/stripe/connect", { method: "POST" });
    setConnectBusy(false);
    if (!r.ok) return setConnectMsg(r.error);
    window.location.assign(r.data.url);
  }

  if (loading) return <main className="screen"><p className="muted" role="status">Cargando…</p></main>;
  if (loadError)
    return (
      <main className="screen">
        <h1>Cobrar</h1>
        <p className="error" role="alert">{loadError}</p>
        <button className="btn secondary" onClick={() => void load()}>Reintentar</button>
      </main>
    );

  const unavailable = config && (!config.configured || !config.authorized);
  return (
    <main className="screen">
      <header>
        <Link className="back-link" href="/">← Contar monedas</Link>
        <h1>Cobrar</h1>
        <p className="muted">Genera un QR y recibe la confirmación del pago aquí mismo.</p>
        {config?.mode === "test" && <p className="badge-test" role="note">Modo prueba: no se cobra dinero real</p>}
        {config?.mode === "live" && <p className="badge-live" role="note">Cobros reales</p>}
      </header>

      {unavailable && (
        <p className="auth-success" role="status">
          {!config?.configured ? "Los cobros con Stripe aún no están configurados en este servidor." : config?.reason ?? "Tu usuario no está autorizado para cobrar."}
        </p>
      )}

      {!charge ? (
        <form onSubmit={generar} noValidate>
          <label htmlFor="monto">Importe a cobrar (MXN)</label>
          <div className="money-input">
            <span aria-hidden>$</span>
            <input id="monto" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amountInput}
              onChange={(e) => { setAmountInput(e.target.value); setError(null); }} aria-invalid={!!error} aria-describedby="monto-error" disabled={unavailable === true} />
          </div>
          <div className="quick" role="group" aria-label="Cantidades rápidas">
            {QUICK.map((q) => (
              <button type="button" key={q} onClick={() => { setAmountInput(String(q)); setError(null); }} disabled={unavailable === true}>${q}</button>
            ))}
          </div>
          <p id="monto-error" className="error" role="alert">{error}</p>
          <button className="btn primary" disabled={creating || unavailable === true}>{creating ? "Generando…" : "Generar QR"}</button>
        </form>
      ) : (
        <section className={`charge charge-${charge.status}`} aria-label="Cobro">
          {charge.status === "paid" ? (
            <div className="paid" role="status">
              <span className="paid-check" aria-hidden>✓</span>
              <h2>Pago confirmado</h2>
              <strong data-testid="paid-amount">{formatCents(charge.amountCents)}</strong>
              {charge.paidAt && <p className="muted">Recibido a las {hora(charge.paidAt)}</p>}
            </div>
          ) : charge.status === "failed" || charge.status === "expired" ? (
            <div role="status">
              <h2>{charge.status === "failed" ? "El pago falló" : "El cobro venció"}</h2>
              <strong>{formatCents(charge.amountCents)}</strong>
              <p className="muted">No se cobró nada. Genera uno nuevo.</p>
            </div>
          ) : (
            <>
              <strong className="charge-amount" data-testid="charge-amount">{formatCents(charge.amountCents)}</strong>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL generada localmente
                <img className="qr" src={qr} alt={`Código QR para pagar ${formatCents(charge.amountCents)}`} width={280} height={280} />
              ) : (
                <div className="qr qr-loading" aria-hidden />
              )}
              <p className="waiting" role="status">
                <span className="dot" aria-hidden />
                {charge.status === "processing" ? "Pago en proceso; esperando que el banco lo acredite…" : "Esperando el pago…"}
              </p>
              {charge.expiresAt && <p className="muted">Vence a las {hora(charge.expiresAt)}</p>}
              <button className="btn secondary" onClick={() => void compartir()}>Compartir enlace de pago</button>
              <p className="notice" role="status">{copied}</p>
            </>
          )}
          <button className={`btn ${charge.status === "paid" || TERMINAL.has(charge.status) ? "primary" : "secondary"}`} onClick={nuevo}>Nuevo cobro</button>
        </section>
      )}

      <section aria-label="Cobros recientes">
        <h2>Cobros recientes</h2>
        {recent.length === 0 ? (
          <p className="muted">Aún no hay cobros.</p>
        ) : (
          <ul className="sales">
            {recent.slice(0, 8).map((p) => (
              <li key={p.id}>
                <time dateTime={p.createdAt}>{hora(p.createdAt)} · {LABEL[p.status]}</time>
                <span className={p.status === "paid" ? "ok" : undefined}>{formatCents(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="connect" aria-label="Cuenta de cobro">
        <h2>Tu cuenta de cobro</h2>
        {config?.connect.enabled ? (
          config.connect.chargesEnabled ? (
            <p className="notice">Cuenta de Stripe conectada: recibes tus propios cobros.</p>
          ) : (
            <>
              <p className="muted">{config.connect.connected ? "Termina el registro en Stripe para poder cobrar." : "Conecta tu cuenta de Stripe para recibir tus propios cobros."}</p>
              <button className="btn secondary" onClick={() => void conectar()} disabled={connectBusy}>
                {connectBusy ? "Abriendo Stripe…" : config.connect.connected ? "Continuar registro" : "Conectar mi cuenta"}
              </button>
              <p className="error" role="alert">{connectMsg}</p>
            </>
          )
        ) : (
          <>
            <p className="muted">Por ahora los cobros llegan a la cuenta del propietario. Conectar tu propia cuenta estará disponible próximamente.</p>
            <button className="btn secondary" disabled>Conectar mi cuenta (próximamente)</button>
          </>
        )}
      </section>
    </main>
  );
}
