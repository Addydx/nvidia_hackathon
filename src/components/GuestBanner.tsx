import Link from "next/link";

/** Aviso del modo invitado: explica qué se guarda y dónde, con «Iniciar sesión» siempre a la vista (también en móvil). */
export default function GuestBanner() {
  return (
    <aside className="guest-banner" aria-label="Modo invitado">
      <p>
        Registra ventas en efectivo y haz tu corte de caja. Puedes usar la app sin cuenta. Inicia sesión para guardar tus
        datos y recuperarlos en otro dispositivo.
      </p>
      <div className="guest-actions">
        <Link className="btn primary" href="/acceso">Iniciar sesión</Link>
        <Link className="guest-link" href="/registro">Crear cuenta</Link>
      </div>
    </aside>
  );
}
