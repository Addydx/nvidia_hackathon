"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createApi, type Api, type Profile } from "@/lib/caja/transport";

type Ctx = { ready: boolean; profile: Profile; api: Api | null };
const guest: Profile = { mode: "guest" };
const ProfileContext = createContext<Ctx>({ ready: false, profile: guest, api: null });

/**
 * Perfil activo de la pestaña: «user» si hay sesión (el servidor la verifica) o «guest». Todo lo que muestran
 * Caja, Cierre y el asistente sale SOLO de este perfil; al iniciar o cerrar sesión se recarga la página y no se
 * importa ni se mezcla nada entre invitado y cuenta.
 */
export default function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; profile: Profile }>({ ready: false, profile: guest });

  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/yo", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (vivo) setState({ ready: true, profile: d?.user ? { mode: "user", id: d.user.id, email: d.user.email } : guest });
      })
      // Sin conexión con el servidor: se sigue como invitado (datos locales), nunca mostrando datos de una cuenta.
      .catch(() => vivo && setState({ ready: true, profile: guest }));
    return () => { vivo = false; };
  }, []);

  const api = useMemo(() => (state.ready ? createApi(state.profile) : null), [state]);
  return <ProfileContext.Provider value={{ ...state, api }}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);
