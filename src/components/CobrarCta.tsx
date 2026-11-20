import Link from "next/link";

/** Botón principal «Cobrar con Stripe». Solo enlaza a /cobrar: el cobro real ocurre en el servidor. */
export default function CobrarCta() {
  return (
    <Link className="cta-stripe" href="/cobrar">
      <span className="cta-icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M20 20h1v1" />
        </svg>
      </span>
      <span className="cta-text">
        <strong>Cobrar con Stripe</strong>
        <small>QR de pago con tarjeta · confirmación automática</small>
      </span>
    </Link>
  );
}
