"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "./ProfileProvider";

const PUBLICAS = ["/acceso", "/registro", "/recuperar", "/cambiar-contrasena"];

export default function Nav() {
  const path = usePathname();
  const { ready, profile } = useProfile();
  const publica = PUBLICAS.includes(path);

  async function salir() {
    await fetch("/api/auth/salir", { method: "POST" }).catch(() => undefined);
    window.location.replace("/"); // al recargar, el perfil activo pasa a invitado: se ven solo sus datos locales
  }

  if (publica) return null;
  return (
    <>
      {ready && (
        <div className="session-bar">
          {profile.mode === "user" ? (
            <>
              <span title={profile.email}>{profile.email}</span>
              <button onClick={() => void salir()}>Cerrar sesión</button>
            </>
          ) : (
            <>
              <span>Modo invitado</span>
              <Link className="session-login" href="/acceso">Iniciar sesión</Link>
            </>
          )}
        </div>
      )}
    </>
  );
}
