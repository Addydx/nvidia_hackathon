"use client";

import { useSearchParams } from "next/navigation";
import { RECOVERY_ENABLED } from "@/lib/features";
import AuthForm, { postJson } from "./AuthForm";

export default function LoginPage() {
  const params = useSearchParams();
  const notice = params.get("confirmado")
    ? "Correo confirmado. Ya puedes iniciar sesión."
    : params.get("salio")
      ? "Cerraste sesión."
      : params.get("cambio")
        ? "Contraseña actualizada. Inicia sesión con la nueva."
        : null;
  return (
    <AuthForm
      title="Inicia sesión"
      subtitle="Entra a tu caja."
      notice={notice}
      submit="Entrar"
      busy="Entrando…"
      fields={[
        { name: "email", label: "Correo", type: "email", autoComplete: "email" },
        { name: "password", label: "Contraseña", type: "password", autoComplete: "current-password" },
      ]}
      onSubmit={async (v) => {
        const r = await postJson("/api/auth/login", { email: v.email ?? "", password: v.password ?? "" });
        if (!r.ok) return r.error ?? "No se pudo iniciar sesión.";
        window.location.replace(("/")); // recarga completa: la sesión nueva ya viaja en la cookie
        return null;
      }}
      links={[
        ...(RECOVERY_ENABLED ? [{ href: "/recuperar", label: "¿Olvidaste tu contraseña?" }] : []),
        { href: "/registro", label: "Crear una cuenta" },
        { href: "/", label: "Continuar sin cuenta" },
      ]}
    />
  );
}
