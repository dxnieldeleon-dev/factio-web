import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Lock, ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import factioLogo from "@/assets/factio-logo.png.asset.json";

const authSearchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Factio" },
      { name: "description", content: "Accede a tu cuenta de Factio para emitir CFDI 4.0." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { mode: modeParam } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(modeParam ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (modeParam && modeParam !== mode) setMode(modeParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeParam]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setUnconfirmedEmail(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Bienvenido a Factio.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      // Supabase devuelve este error tal cual en inglés ("Email not
      // confirmed") cuando la cuenta existe pero nunca se confirmó el
      // correo del registro — se traduce y se ofrece reenviar el enlace en
      // vez de mostrar el mensaje crudo del proveedor de auth.
      const isUnconfirmed =
        err instanceof Error &&
        (err.message === "Email not confirmed" ||
          ("code" in err && (err as { code?: string }).code === "email_not_confirmed"));
      if (isUnconfirmed) {
        setUnconfirmedEmail(email);
        toast.error("Tu correo aún no está confirmado. Revisa tu bandeja de entrada.");
      } else {
        toast.error(err instanceof Error ? err.message : "No pudimos iniciar sesión");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onResendConfirmation() {
    if (!unconfirmedEmail) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: unconfirmedEmail });
      if (error) throw error;
      toast.success(`Te reenviamos el enlace de confirmación a ${unconfirmedEmail}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos reenviar el correo");
    } finally {
      setResending(false);
    }
  }

  async function onForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos enviar el correo");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falló el inicio con Google");
      setLoading(false);
    }
  }

  function goToMode(next: "signin" | "signup" | "forgot") {
    setMode(next);
    setResetSent(false);
    setUnconfirmedEmail(null);
    navigate({ to: "/auth", search: { mode: next }, replace: true });
  }

  if (mode === "forgot") {
    return (
      <div className="app-shell flex min-h-dvh flex-col justify-center px-6 py-10">
        <button
          onClick={() => goToMode("signin")}
          className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Volver
        </button>

        {resetSent ? (
          <div className="animate-reveal">
            <h1 className="text-2xl font-bold tracking-tight">Revisa tu correo</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Te enviamos un enlace a <span className="font-semibold text-foreground">{email}</span>{" "}
              para restablecer tu contraseña. Si no lo ves, revisa tu carpeta de spam.
            </p>
          </div>
        ) : (
          <div className="animate-reveal">
            <h1 className="text-2xl font-bold tracking-tight">Recupera tu contraseña</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
            </p>
            <form onSubmit={onForgotSubmit} className="mt-6 space-y-3">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full rounded-2xl border border-input bg-surface py-3.5 pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-sm font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Enviar enlace <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="animate-reveal">
        <div className="flex items-center gap-2">
          <img src={factioLogo.url} alt="Factio" className="size-9 rounded-lg" />
          <span className="font-semibold tracking-tight">Factio</span>
        </div>
        <h1 className="mt-8 text-3xl font-bold tracking-tight">
          {mode === "signin" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Accede para emitir y administrar tus facturas CFDI 4.0."
            : "Empieza a facturar en menos de 60 segundos."}
        </p>
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={loading}
        className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface px-5 py-3.5 text-sm font-semibold shadow-soft transition hover:bg-accent disabled:opacity-60"
      >
        <GoogleLogo />
        Continuar con Google
      </button>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>o con correo</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setUnconfirmedEmail(null);
            }}
            placeholder="tu@correo.com"
            className="w-full rounded-2xl border border-input bg-surface py-3.5 pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
          />
        </div>

        {unconfirmedEmail && (
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900">
            <p className="text-sm font-semibold">Tu correo aún no está confirmado</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
              Te enviamos un enlace de confirmación a {unconfirmedEmail} cuando creaste la cuenta.
              Revisa tu bandeja de entrada (y spam) o pide que te lo reenviemos.
            </p>
            <button
              type="button"
              disabled={resending}
              onClick={onResendConfirmation}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-3 py-1.5 text-[11px] font-semibold text-amber-50 disabled:opacity-60"
            >
              {resending ? <Loader2 className="size-3 animate-spin" /> : null} Reenviar correo de
              confirmación
            </button>
          </div>
        )}

        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña (mín. 8 caracteres)"
            className="w-full rounded-2xl border border-input bg-surface py-3.5 pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
          />
        </div>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => goToMode("forgot")}
            className="block text-right text-xs font-semibold text-primary"
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-sm font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "signin" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
        <button
          onClick={() => goToMode(mode === "signin" ? "signup" : "signin")}
          className="font-semibold text-primary hover:underline"
        >
          {mode === "signin" ? "Regístrate" : "Inicia sesión"}
        </button>
      </p>

      {mode === "signup" && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Al crear una cuenta aceptas nuestros{" "}
          <Link to="/terminos" className="font-medium text-primary hover:underline">
            Términos y Condiciones
          </Link>{" "}
          y nuestro{" "}
          <Link to="/privacidad" className="font-medium text-primary hover:underline">
            Aviso de Privacidad
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
