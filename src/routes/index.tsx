import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, Sparkles, ShieldCheck, X, Zap } from "lucide-react";
import factioLogo from "@/assets/factio-logo.png.asset.json";

const NAV_LINKS = [
  { href: "#funciones", label: "Funciones" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Factio — Factura en menos de 60 segundos" },
      {
        name: "description",
        content:
          "La forma más sencilla de emitir facturas electrónicas en México. Para freelancers, profesionistas y pequeñas empresas.",
      },
      { property: "og:title", content: "Factio — Factura en menos de 60 segundos" },
      {
        property: "og:description",
        content:
          "La forma más sencilla de emitir facturas electrónicas en México. Para freelancers, profesionistas y pequeñas empresas.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Cierra el menú móvil con Escape o al hacer clic fuera del header.
  useEffect(() => {
    if (!mobileNavOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMobileNavOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [mobileNavOpen]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        ref={headerRef}
        className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <img src={factioLogo.url} alt="Factio" className="size-8 rounded-lg" />
            <span className="font-semibold tracking-tight">Factio</span>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="hidden text-sm font-semibold text-foreground transition hover:text-primary md:inline-flex"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="hidden items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 md:inline-flex"
            >
              Comenzar
            </Link>

            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              aria-label={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
              className="grid size-10 place-items-center rounded-full border border-border bg-surface md:hidden"
            >
              {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <nav
            id="mobile-nav"
            className="flex flex-col gap-1 border-t border-border px-5 pb-5 pt-2 md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              onClick={() => setMobileNavOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              onClick={() => setMobileNavOpen(false)}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
            >
              Comenzar
            </Link>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-5 pt-16 pb-24">
        <div className="animate-reveal max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            Hecho para México · CFDI 4.0
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
            Factura en menos de <span className="text-primary">60 segundos</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            La forma más sencilla de emitir CFDI 4.0 desde tu celular. Sin formularios eternos, sin
            tecnicismos del SAT.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background hover:opacity-90 transition"
            >
              Empezar gratis
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3.5 text-sm font-semibold hover:bg-accent transition"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "Rápido de verdad",
              body: "Crea, timbra y envía una factura sin salir de tu celular.",
            },
            {
              icon: ShieldCheck,
              title: "Evita errores fiscales",
              body: "Validamos RFC, régimen y uso CFDI antes de timbrar.",
            },
            {
              icon: Sparkles,
              title: "Diseñado para ti",
              body: "Interfaz sencilla, pensada para freelancers y pequeñas empresas.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-border bg-surface p-6 shadow-soft"
            >
              <div className="grid size-10 place-items-center rounded-2xl bg-primary-soft text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-10">
        <div className="flex flex-wrap gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Factio</span>
          <Link to="/terminos" className="hover:text-foreground hover:underline">
            Términos y Condiciones
          </Link>
          <Link to="/privacidad" className="hover:text-foreground hover:underline">
            Aviso de Privacidad
          </Link>
        </div>
      </footer>
    </div>
  );
}
