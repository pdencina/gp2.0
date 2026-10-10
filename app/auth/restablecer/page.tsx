"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authMessage, passwordProblem } from "@/lib/authErrors";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";

export default function RestablecerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== repeat) return setError("Las contraseñas no coinciden.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(authMessage(error.message));
    router.push("/inicio");
    router.refresh();
  }

  const input = "input h-12";

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden p-6">
      <span aria-hidden="true" className="float-slow absolute -left-20 top-16 -z-10 h-64 w-64 rounded-full bg-brand-orange-100" />
      <span aria-hidden="true" className="float-slower absolute -right-16 bottom-12 -z-10 h-72 w-72 rounded-full bg-brand-teal-100" />
      <div className="enter card w-full max-w-sm p-7">
        <div className="mb-6">
          <Logo />
        </div>
        <span aria-hidden="true" className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-teal-50 text-brand-teal">
          <Icon name="lock" className="h-5 w-5" />
        </span>
        <h1 className="page-title">Elige tu nueva contraseña</h1>
        <p className="mb-6 mt-1 text-sm text-stone-500">Al menos 8 caracteres, con letras y números.</p>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <input
            className={input}
            type={show ? "text" : "password"}
            placeholder="Nueva contraseña"
            aria-label="Nueva contraseña"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className={input}
            type="password"
            placeholder="Repite la contraseña"
            aria-label="Repite la contraseña"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-stone-500">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Mostrar las contraseñas
          </label>
          {error && (
            <p role="alert" className="pop-in flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
              <Icon name="alert" className="mt-0.5 h-4 w-4 text-red-600" />
              <span>{error}</span>
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg w-full"
          >
            {loading ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </main>
  );
}
