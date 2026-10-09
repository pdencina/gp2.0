"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.");
      else {
        router.push("/inicio");
        router.refresh();
      }
    } else if (mode === "registro") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.push("/inicio");
        router.refresh();
      } else setInfo("Te enviamos un correo para confirmar tu cuenta.");
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback`,
      });
      if (error) setError(error.message);
      else setInfo("Si el correo existe, te enviamos un enlace para recuperar tu contraseña.");
    }
    setLoading(false);
  }

  async function onMagicLink() {
    if (!email) return setError("Escribe tu correo para enviarte el enlace.");
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setInfo("Revisa tu correo: te enviamos un enlace para ingresar.");
  }

  async function onGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
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
            required
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
          required
        />
        {mode !== "recuperar" && (
          <div className="relative">
            <input
              className={input}
              type={show ? "text" : "password"}
              placeholder="Contraseña"
              aria-label="Contraseña"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
        )}

        {mode === "login" && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => setMode("recuperar")}
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
          <div className="my-5 text-center text-xs text-stone-400">o continúa con</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onGoogle}
              className="h-10 rounded-lg border border-stone-300 text-sm hover:bg-stone-50"
            >
              Google
            </button>
            <button
              type="button"
              onClick={onMagicLink}
              className="h-10 rounded-lg border border-stone-300 text-sm hover:bg-stone-50"
            >
              Enlace por correo
            </button>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-sm text-stone-600">
        {mode === "login" ? (
          <>
            ¿Primera vez?{" "}
            <button onClick={() => setMode("registro")} className="font-medium text-brand-teal hover:underline">
              Crea tu cuenta
            </button>
          </>
        ) : (
          <button onClick={() => setMode("login")} className="font-medium text-brand-teal hover:underline">
            Volver a ingresar
          </button>
        )}
      </p>
    </div>
  );
}
