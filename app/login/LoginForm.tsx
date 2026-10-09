"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authMessage, passwordProblem } from "@/lib/authErrors";

type Mode = "login" | "registro" | "recuperar";

const input =
  "h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return setError("Escribe un correo válido.");

    if (mode === "registro") {
      if (name.trim().length < 2) return setError("Escribe tu nombre completo.");
      const problem = passwordProblem(password);
      if (problem) return setError(problem);
      if (!accepted) return setError("Debes aceptar la política de privacidad para crear tu cuenta.");
    }
    if (mode === "login" && !password) return setError("Escribe tu contraseña.");

    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) setError(authMessage(error.message));
      else {
        router.push("/inicio");
        router.refresh();
      }
    } else if (mode === "registro") {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) setError(authMessage(error.message));
      else if (data.session) {
        router.push("/inicio");
        router.refresh();
      } else setInfo("Te enviamos un correo para confirmar tu cuenta. Revisa también el spam.");
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${origin}/auth/callback?next=/auth/restablecer`,
      });
      if (error) setError(authMessage(error.message));
      else setInfo("Si el correo tiene una cuenta, te enviamos un enlace para recuperar tu contraseña.");
    }
    setLoading(false);
  }

  async function onMagicLink() {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return setError("Escribe tu correo para enviarte el enlace.");
    setError("");
    setInfo("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false },
    });
    setLoading(false);
    if (error) setError(authMessage(error.message));
    else setInfo("Si el correo tiene una cuenta, te enviamos un enlace para ingresar.");
  }

  const titles: Record<Mode, [string, string, string]> = {
    login: ["Bienvenido de vuelta", "Ingresa para ver tu grupo", "Ingresar"],
    registro: ["Crea tu cuenta", "Solo te tomará un minuto", "Crear cuenta"],
    recuperar: ["Recupera tu contraseña", "Te enviaremos un enlace al correo", "Enviar enlace"],
  };
  const [title, subtitle, cta] = titles[mode];

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-2xl font-medium">{title}</h2>
      <p className="mb-6 mt-1 text-sm text-stone-500">{subtitle}</p>

      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        {mode === "registro" && (
          <input
            className={input}
            placeholder="Tu nombre completo"
            aria-label="Nombre completo"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className={input}
          type="email"
          inputMode="email"
          placeholder="nombre@correo.com"
          aria-label="Correo electrónico"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== "recuperar" && (
          <div>
            <div className="relative">
              <input
                className={input}
                type={show ? "text" : "password"}
                placeholder="Contraseña"
                aria-label="Contraseña"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-3 text-xs text-stone-500"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? "Ocultar" : "Ver"}
              </button>
            </div>
            {mode === "registro" && (
              <p className="mt-1 text-xs text-stone-500">Al menos 8 caracteres, con letras y números.</p>
            )}
          </div>
        )}

        {mode === "registro" && (
          <label className="flex items-start gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Acepto la{" "}
              <Link href="/privacidad" target="_blank" className="text-brand-teal underline">
                política de privacidad
              </Link>
              .
            </span>
          </label>
        )}

        {mode === "login" && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => switchMode("recuperar")}
              className="text-xs text-brand-teal hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-lg bg-brand-orange font-medium text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {loading ? "Un momento…" : cta}
        </button>
      </form>

      {mode === "login" && (
        <>
          <div className="my-5 text-center text-xs text-stone-400">o</div>
          <button
            type="button"
            onClick={onMagicLink}
            disabled={loading}
            className="h-10 w-full rounded-lg border border-stone-300 text-sm hover:bg-stone-50 disabled:opacity-60"
          >
            Ingresar con un enlace por correo
          </button>
        </>
      )}

      <p className="mt-6 text-center text-sm text-stone-600">
        {mode === "login" ? (
          <>
            ¿Primera vez?{" "}
            <button onClick={() => switchMode("registro")} className="font-medium text-brand-teal hover:underline">
              Crea tu cuenta
            </button>
          </>
        ) : (
          <button onClick={() => switchMode("login")} className="font-medium text-brand-teal hover:underline">
            Volver a ingresar
          </button>
        )}
      </p>
    </div>
  );
}
