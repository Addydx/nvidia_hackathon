"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const PUBLICAS = ["/acceso", "/registro", "/recuperar", "/cambiar-contrasena", "/pago/gracias", "/pago/cancelado"];

export default function Nav() {
  const path = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const publica = PUBLICAS.includes(path);

  useEffect(() => {
    if (publica) return;
    let vivo = true;
    fetch("/api/auth/yo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => vivo && setEmail(d?.user?.email ?? null))
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [publica, path]);

  async function salir() {
    await fetch("/api/auth/salir", { method: "POST" }).catch(() => undefined);
    window.location.replace(("/acceso?salio=1"));
  }

  if (publica) return null;
  const item = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>
  );
  return (
    <>
      <nav className="tabs" aria-label="Principal">{item("/", "Caja")}{item("/cierre", "Cierre")}{item("/cobrar", "Cobrar")}</nav>
      {email && (
        <div className="session-bar">
          <span title={email}>{email}</span>
          <button onClick={() => void salir()}>Cerrar sesión</button>
        </div>
      )}
    </>
  );
}
