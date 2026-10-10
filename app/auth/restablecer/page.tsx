"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authMessage, passwordProblem } from "@/lib/authErrors";
import { Logo } from "@/components/Logo";

export default function RestablecerPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const input =
    "h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Logo />
        </div>
        <h1 className="page-title">Elige tu nueva contraseña</h1>
        <p className="mb-6 mt-1 text-sm text-stone-500">Al menos 8 caracteres, con letras y números.</p>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <input
            className={input}
            type="password"
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
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full btn btn-primary"
          >
            {loading ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </main>
  );
}
