"use client";

import Link from "next/link";
import { useState } from "react";

export type Field = { name: "email" | "password" | "confirm"; label: string; type: "email" | "password"; autoComplete: string };

type Props = {
  title: string;
  subtitle?: string;
  fields: Field[];
  submit: string;
  busy: string;
  /** Envía el formulario; devuelve un mensaje de error o null si salió bien. */
  onSubmit: (values: Record<string, string>) => Promise<string | null>;
  notice?: string | null;
  links?: { href: string; label: string }[];
  /** Si se define, tras un envío correcto se muestra este mensaje en vez del formulario. */
  success?: string;
};

/** Pantalla de acceso con degradado sutil; mismo lenguaje visual que Caja (carbón + verde lima). */
export default function AuthForm({ title, subtitle, fields, submit, busy, onSubmit, notice, links, success }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    const msg = await onSubmit(values);
    setSaving(false);
    if (msg) setError(msg);
    else if (success) setDone(true);
  }

  return (
    <div className="auth-bg">
      <main className="auth-card">
        <header>
          <p className="auth-brand">Corte de caja</p>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </header>

        {notice && <p className="notice" role="status">{notice}</p>}

        {done && success ? (
          <p className="auth-success" role="status">{success}</p>
        ) : (
          <form onSubmit={enviar} noValidate>
            {fields.map((f) => (
              <div key={f.name} className="auth-field">
                <label htmlFor={`f-${f.name}`}>{f.label}</label>
                <input
                  id={`f-${f.name}`}
                  name={f.name}
                  type={f.type === "password" && show ? "text" : f.type}
                  autoComplete={f.autoComplete}
                  inputMode={f.type === "email" ? "email" : undefined}
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  aria-invalid={!!error}
                  aria-describedby="auth-error"
                />
              </div>
            ))}
            {fields.some((f) => f.type === "password") && (
              <label className="auth-show">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar contraseña
              </label>
            )}
            <p id="auth-error" className="error" role="alert">{error}</p>
            <button className="btn primary" disabled={saving}>{saving ? busy : submit}</button>
          </form>
        )}

        {links && (
          <nav className="auth-links" aria-label="Otras opciones">
            {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
          </nav>
        )}
      </main>
    </div>
  );
}

export async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, status: res.status, data } : { ok: false, status: res.status, error: data?.error ?? "No se pudo completar la operación." };
  } catch {
    return { ok: false, status: 0, error: "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo." };
  }
}
