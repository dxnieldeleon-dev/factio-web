import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  Check,
  FileCheck2,
  FilePlus2,
  History,
  IdCard,
  Lock,
  Mail,
  Menu,
  Mic,
  Package,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Stamp,
  Stethoscope,
  Store,
  Users,
  X,
} from "lucide-react";
import factioLogo from "@/assets/factio-logo.png.asset.json";
import { HeroMockup } from "@/components/hero-mockup";
import { PricingCard } from "@/components/pricing-card";

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
        <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="animate-reveal max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              Hecho para México · CFDI 4.0
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
              Factura en menos de <span className="text-primary">60 segundos</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              La forma más sencilla de emitir CFDI 4.0 desde tu celular. Sin formularios eternos,
              sin tecnicismos del SAT.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background hover:opacity-90 transition"
              >
                Comenzar
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

          <div className="mt-16 lg:mt-0">
            <HeroMockup />
          </div>
        </div>

        <section id="antes-despues" className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Deja atrás el papeleo fiscal
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Facturar no debería ser la parte más pesada de tu semana.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-surface p-6 shadow-soft">
              <h3 className="font-semibold text-muted-foreground">Antes de Factio</h3>
              <ul className="mt-4 space-y-3">
                {[
                  "Portal del SAT lento y confuso",
                  "Capturar los mismos datos cada vez",
                  "Miedo a cometer errores fiscales",
                  "Facturas perdidas en el correo",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <X className="mt-0.5 size-4 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-primary/30 bg-primary-soft p-6 shadow-soft">
              <h3 className="font-semibold text-primary">Con Factio</h3>
              <ul className="mt-4 space-y-3">
                {[
                  "Perfil de facturación guardado, timbra en 1 clic",
                  "RFC, régimen y uso de CFDI validados automáticamente",
                  "Validación antes de timbrar, sin sorpresas",
                  "Historial claro y reenvío con un clic",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-medium">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="funciones" className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Todo lo que necesitas para facturar sin fricción
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: FileCheck2,
                title: "Timbrado CFDI 4.0",
                body: "Genera comprobantes fiscales válidos ante el SAT en segundos.",
              },
              {
                icon: Users,
                title: "Factura Global",
                body: "Ideal para ventas al público en general, sin factura individual por cliente.",
              },
              {
                icon: Mail,
                title: "Envío automático por email",
                body: "Tu cliente recibe el PDF y XML en cuanto timbras.",
              },
              {
                icon: RotateCcw,
                title: "Cancelación con seguimiento",
                body: "Cancela y da seguimiento a la aceptación sin perder el hilo.",
              },
              {
                icon: IdCard,
                title: "Perfil de Facturación",
                body: "Configura tus datos fiscales una vez, factura siempre igual.",
              },
              {
                icon: Package,
                title: "Catálogo de productos y servicios",
                body: "Guarda lo que vendes y factura con un par de toques.",
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
        </section>

        <section className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Así de simple se ve facturar
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* TODO: reemplazar placeholders por screenshots reales del producto */}
            {[
              { icon: FilePlus2, label: "Crea tu factura en segundos" },
              { icon: Stamp, label: "Timbra con un toque" },
              { icon: History, label: "Consulta tu historial completo" },
              { icon: Send, label: "Reenvía o descarga cuando quieras" },
            ].map((step) => (
              <div key={step.label}>
                <div className="grid aspect-[9/16] place-items-center rounded-3xl border border-border bg-muted">
                  <step.icon className="size-10 text-muted-foreground" />
                </div>
                <p className="mt-3 text-center text-sm font-medium">{step.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Empieza en cuatro pasos
            </h2>
          </div>

          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "1",
                title: "Crea tu cuenta",
                body: "Regístrate y configura tu Perfil de Facturación una sola vez.",
              },
              {
                step: "2",
                title: "Agrega tus productos o servicios",
                body: "Los que factures seguido, listos para usar.",
              },
              {
                step: "3",
                title: "Factura en segundos",
                body: "Selecciona, revisa y timbra.",
              },
              {
                step: "4",
                title: "Envía o descarga",
                body: "Tu cliente recibe el CFDI automáticamente.",
              },
            ].map((s) => (
              <div key={s.step}>
                <div className="grid size-10 place-items-center rounded-2xl bg-primary-soft font-bold text-primary">
                  {s.step}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Factio se adapta a tu forma de trabajar
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Briefcase,
                title: "Freelancers y consultores",
                body: "Factura tus servicios sin perder tiempo en trámites.",
              },
              {
                icon: Stethoscope,
                title: "Profesionales de la salud",
                body: "Honorarios facturados de forma simple y consistente.",
              },
              {
                icon: Mic,
                title: "Coaches y creadores",
                body: "Factura ingresos recurrentes sin complicarte con el SAT.",
              },
              {
                icon: Store,
                title: "Pequeños negocios de servicios",
                body: "Un flujo fiscal que no te distrae de tu operación.",
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
        </section>

        <section className="mt-24">
          <div className="rounded-3xl bg-primary-soft p-8 md:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Tu información fiscal, en manos serias
              </h2>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  title: "PAC certificado",
                  body: "Timbramos a través de un Proveedor Autorizado de Certificación reconocido por el SAT.",
                },
                {
                  icon: FileCheck2,
                  title: "Cumple CFDI 4.0",
                  body: "Siempre alineado a la normativa vigente.",
                },
                {
                  icon: Lock,
                  title: "Datos protegidos",
                  body: "Tu información se resguarda con estándares de seguridad modernos.",
                },
              ].map((point) => (
                <div key={point.title}>
                  <point.icon className="size-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{point.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{point.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="precios" className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Elige el plan que se ajusta a tu volumen
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Sin permanencia forzosa. Cambia o cancela cuando quieras.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Básico",
                price: "$99",
                features: [
                  "10 facturas incluidas al mes",
                  "Timbrado CFDI 4.0",
                  "Envío automático por email",
                ],
                ctaLabel: "Elegir Básico",
              },
              {
                name: "Estándar",
                price: "$149",
                features: [
                  "25 facturas incluidas al mes",
                  "Timbrado CFDI 4.0",
                  "Envío automático por email",
                  "Complemento de Pago",
                ],
                ctaLabel: "Elegir Estándar",
                highlighted: true,
              },
              {
                name: "Premium",
                price: "$199",
                features: [
                  "50 facturas incluidas al mes",
                  "Timbrado CFDI 4.0",
                  "Envío automático por email",
                  "Complemento de Pago",
                  "Carta Porte",
                ],
                ctaLabel: "Elegir Premium",
              },
            ].map((plan) => (
              <PricingCard key={plan.name} {...plan} />
            ))}
          </div>
        </section>
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
