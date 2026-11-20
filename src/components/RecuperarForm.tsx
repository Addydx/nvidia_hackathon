"use client";

import AuthForm, { postJson } from "./AuthForm";

export default function RecuperarForm() {
  return (
    <AuthForm
      title="Recupera tu contraseña"
      subtitle="Escribe tu correo y te enviamos un enlace para elegir una nueva."
      submit="Enviar enlace"
      busy="Enviando…"
      success="Si ese correo tiene cuenta, te enviamos un enlace. Revisa tu bandeja y la carpeta de spam; puede tardar unos minutos."
      fields={[{ name: "email", label: "Correo", type: "email", autoComplete: "email" }]}
      onSubmit={async (v) => {
        const r = await postJson("/api/auth/recuperar", { email: v.email ?? "" });
        return r.ok ? null : (r.error ?? "No se pudo enviar el enlace.");
      }}
      links={[{ href: "/acceso", label: "Volver a iniciar sesión" }]}
    />
  );
}
