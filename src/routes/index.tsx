import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCheck2,
  FileCode,
  Filter,
  IdCard,
  Lock,
  Mail,
  Menu,
  MessageCircle,
  Mic,
  Package,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Store,
  Users,
  X,
} from "lucide-react";
import factioLogo from "@/assets/factio-logo.png.asset.json";
import { HeroMockup } from "@/components/hero-mockup";
import { PricingCard } from "@/components/pricing-card";
import { FaqItem } from "@/components/faq-item";
import { SiteFooter } from "@/components/site-footer";

const NAV_LINKS = [
  { href: "#funciones", label: "Funciones" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
];

function NewInvoiceMockup() {
  return (
    <div className="space-y-3 text-[10px] leading-tight sm:text-xs">
      <div className="flex items-center gap-2 font-semibold">
        <ArrowLeft className="size-3.5" />
        Nueva factura
      </div>
      <div className="rounded-xl border border-border p-2.5">
        <p className="text-[9px] text-muted-foreground">Cliente</p>
        <p className="mt-1 truncate font-medium">Empresa Ejemplo S.A. de C.V.</p>
        <p className="mt-1 text-[9px] text-muted-foreground">EJE900101AAA</p>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border p-2.5">
        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground">Uso CFDI</p>
          <p className="mt-1 truncate font-medium">G03 - Gastos en general</p>
        </div>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold">Conceptos</p>
        <div className="mt-2 flex justify-between gap-2 border-b border-border pb-2">
          <div className="min-w-0">
            <p className="truncate font-medium">Servicio de consultoría</p>
            <p className="mt-1 text-[9px] text-muted-foreground">1 x $1,000.00</p>
          </div>
          <p className="shrink-0 font-medium">$1,000.00</p>
        </div>
        <p className="mt-2 font-medium text-primary">+ Agregar concepto</p>
      </div>
      <div className="space-y-1.5 border-t border-border pt-2.5 text-muted-foreground">
        <div className="flex justify-between"><span>Subtotal</span><span>$1,000.00</span></div>
        <div className="flex justify-between"><span>IVA (16%)</span><span>$160.00</span></div>
        <div className="flex justify-between pt-1 font-bold text-foreground"><span>Total</span><span>$1,160.00</span></div>
      </div>
      <div className="rounded-xl bg-primary px-3 py-2.5 text-center font-semibold text-primary-foreground">
        Emitir factura
      </div>
    </div>
  );
}

function StampedInvoiceMockup() {
  return (
    <div className="flex min-h-full flex-col text-center text-[10px] leading-tight sm:text-xs">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
        <FileCheck2 className="size-7" />
      </div>
      <h4 className="mt-4 text-sm font-semibold">¡Factura timbrada!</h4>
      <p className="mt-2 text-muted-foreground">Tu factura ha sido generada correctamente.</p>
      <div className="mt-5 rounded-xl bg-muted p-3 text-left">
        <p className="text-[9px] text-muted-foreground">Folio fiscal</p>
        <div className="mt-1 flex items-start gap-1 font-mono text-[9px] font-medium leading-snug">
          <span className="break-all">3F7C2E1B-8B4A-4D1F-9E4B-B7F8E1C4A2D6</span>
          <Copy className="size-3 shrink-0 text-muted-foreground" />
        </div>
      </div>
      <div className="mt-5 rounded-xl bg-primary px-3 py-2.5 font-semibold text-primary-foreground">Ver factura</div>
      <p className="mt-3 font-medium text-primary">Ir a mis facturas</p>
    </div>
  );
}

function InvoiceListMockup() {
  const invoices = [
    ["Empresa Ejemplo S.A. de C.V.", "A-000005 · 07-MAY-2024", "$1,160.00"],
    ["Consultoría Integral S.A.", "A-000004 · 06-MAY-2024", "$2,320.00"],
    ["Soluciones Digitales S.A.", "A-000003 · 05-MAY-2024", "$870.00"],
  ];
  return (
    <div className="text-[10px] leading-tight sm:text-xs">
      <h4 className="font-semibold">Facturas</h4>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border px-2 py-2 text-[9px] text-muted-foreground">
          <Search className="size-3 shrink-0" />
          <span className="truncate">Buscar por cliente o folio</span>
        </div>
        <Filter className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-3 flex gap-1.5 text-[9px] font-medium">
        <span className="rounded-full bg-primary px-2 py-1 text-primary-foreground">Todas</span>
        <span className="rounded-full border border-border px-2 py-1">Vigentes</span>
        <span className="rounded-full border border-border px-2 py-1">Canceladas</span>
      </div>
      <div className="mt-3 divide-y divide-border">
        {invoices.map(([client, detail, total]) => (
          <div key={detail} className="flex items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{client}</p>
              <p className="mt-1 text-[8px] text-muted-foreground">{detail}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-medium">{total}</p>
              <span className="mt-1 inline-block rounded-full bg-success/15 px-1.5 py-0.5 text-[8px] font-bold text-success">VIGENTE</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center font-medium text-primary">Ver todas las facturas</p>
    </div>
  );
}

function InvoiceDetailMockup() {
  const actions = [
    [Download, "Descargar PDF"],
    [FileCode, "Descargar XML"],
    [Mail, "Enviar por correo"],
    [MessageCircle, "Compartir por WhatsApp"],
  ] as const;
  return (
    <div className="text-[10px] leading-tight sm:text-xs">
      <div className="flex items-center gap-2">
        <ArrowLeft className="size-3.5 shrink-0" />
        <p className="min-w-0 flex-1 truncate font-semibold">Factura A-000005</p>
        <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[8px] font-bold text-success">VIGENTE</span>
      </div>
      <div className="mt-5">
        <p className="text-muted-foreground">Total</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">$1,160.00 <span className="text-[10px] font-medium text-muted-foreground">MXN</span></p>
      </div>
      <div className="mt-5 border-y border-border py-3">
        <p className="font-medium">Empresa Ejemplo S.A. de C.V.</p>
        <p className="mt-1 text-[9px] text-muted-foreground">EJE900101AAA · 07-MAY-2024</p>
      </div>
      <div className="mt-4">
        <p className="font-semibold">Acciones</p>
        <div className="mt-2 divide-y divide-border">
          {actions.map(([Icon, label]) => (
            <div key={label} className="flex items-center gap-2 py-2 text-primary">
              <Icon className="size-3.5" />
              <span className="font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center font-medium text-primary">Ver factura completa</p>
    </div>
  );
}

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

        <section id="como-funciona" className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Así de simple se ve facturar
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Crea tu factura en segundos y gestiona tu negocio desde un solo lugar.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-4">
            <div className="relative min-w-0">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-lg font-bold text-primary">1</div>
              <h3 className="mt-4 text-center font-semibold">Crea tu factura</h3>
              <p className="mt-1 text-center text-sm text-muted-foreground">Llena los datos y agrega tus conceptos.</p>
              <div className="mt-5 min-h-[21.5rem] rounded-3xl border border-border bg-surface p-5 shadow-soft"><NewInvoiceMockup /></div>
              <div className="absolute left-[calc(100%+0.75rem)] top-34 hidden w-6 items-center lg:flex" aria-hidden="true">
                <div className="w-full border-t border-dashed border-primary/50" /><ArrowRight className="-ml-0.5 size-3 shrink-0 text-primary/70" />
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-lg font-bold text-primary">2</div>
              <h3 className="mt-4 text-center font-semibold">Timbrá al instante</h3>
              <p className="mt-1 text-center text-sm text-muted-foreground">Factio timbra tu CFDI automáticamente.</p>
              <div className="mt-5 min-h-[21.5rem] rounded-3xl border border-border bg-surface p-5 shadow-soft"><StampedInvoiceMockup /></div>
              <div className="absolute left-[calc(100%+0.75rem)] top-34 hidden w-6 items-center lg:flex" aria-hidden="true">
                <div className="w-full border-t border-dashed border-primary/50" /><ArrowRight className="-ml-0.5 size-3 shrink-0 text-primary/70" />
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-lg font-bold text-primary">3</div>
              <h3 className="mt-4 text-center font-semibold">Consulta tu historial</h3>
              <p className="mt-1 text-center text-sm text-muted-foreground">Todos tus comprobantes en un solo lugar.</p>
              <div className="mt-5 min-h-[21.5rem] rounded-3xl border border-border bg-surface p-5 shadow-soft"><InvoiceListMockup /></div>
              <div className="absolute left-[calc(100%+0.75rem)] top-34 hidden w-6 items-center lg:flex" aria-hidden="true">
                <div className="w-full border-t border-dashed border-primary/50" /><ArrowRight className="-ml-0.5 size-3 shrink-0 text-primary/70" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-lg font-bold text-primary">4</div>
              <h3 className="mt-4 text-center font-semibold">Reenvía o descarga</h3>
              <p className="mt-1 text-center text-sm text-muted-foreground">Comparte tu factura cuando y como quieras.</p>
              <div className="mt-5 min-h-[21.5rem] rounded-3xl border border-border bg-surface p-5 shadow-soft"><InvoiceDetailMockup /></div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition hover:opacity-90"
            >
              Comenzar
              <ArrowRight className="size-4" />
            </Link>
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

        <section id="preguntas" className="mt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Preguntas frecuentes</h2>
          </div>

          <div className="mx-auto mt-10 max-w-2xl">
            {[
              {
                q: "¿Necesito e.firma para usar Factio?",
                a: "No. Para timbrar como emisor necesitas tu Certificado de Sello Digital (CSD) — el archivo .cer, el archivo .key y la contraseña con la que lo generaste. Lo configuras una sola vez en tu Perfil de Facturación.",
              },
              {
                q: "¿Qué es la Factura Global?",
                a: "Es el comprobante que agrupa tus ventas al público en general de un periodo, en lugar de generar una factura individual por cada cliente.",
              },
              {
                q: "¿Cómo cancelo una factura ya timbrada?",
                a: "Desde tu historial, con seguimiento del estatus de aceptación ante el SAT hasta que se resuelve.",
              },
              {
                q: "¿Aplica para régimen de honorarios o RESICO?",
                a: "Sí. Factio funciona para personas físicas con actividad empresarial y profesional (honorarios) y para quienes tributan bajo el Régimen Simplificado de Confianza (RESICO).",
              },
              {
                q: "¿Qué pasa si se me acaban las facturas del mes?",
                a: "Puedes actualizar tu plan en cualquier momento desde tu perfil, sin esperar al siguiente ciclo de facturación.",
              },
              {
                q: "¿Cómo cancelo mi suscripción?",
                a: 'Desde "Mi perfil" dentro de la app, sin penalización ni permanencia forzosa.',
              },
            ].map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </section>

        <section className="mt-24">
          <div className="rounded-3xl bg-foreground p-10 text-center text-background md:p-16">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Deja de complicarte con el SAT
            </h2>
            <p className="mt-3 text-lg text-background/70">
              Factura como debe ser: rápido, simple y sin errores.
            </p>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-background px-6 py-3.5 text-sm font-semibold text-foreground transition hover:opacity-90"
            >
              Comenzar
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
