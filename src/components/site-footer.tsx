import { Link } from "@tanstack/react-router";
import factioLogo from "@/assets/factio-logo.png.asset.json";

const FOOTER_COLUMNS = [
  {
    title: "Producto",
    links: [
      { href: "#funciones", label: "Funciones" },
      { href: "#como-funciona", label: "Cómo funciona" },
      { href: "#precios", label: "Precios" },
    ],
  },
  {
    title: "Ayuda",
    links: [
      { href: "#preguntas", label: "Preguntas frecuentes" },
      { href: "mailto:soporte@factio.mx", label: "Contacto" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-5xl px-5 pb-10">
      <div className="grid gap-8 border-t border-border pt-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <img src={factioLogo.url} alt="Factio" className="size-8 rounded-lg" />
            <span className="font-semibold tracking-tight">Factio</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Facturación CFDI 4.0 simple para profesionistas y pequeños negocios.
          </p>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-semibold">{column.title}</p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="text-sm font-semibold">Legal</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link
                to="/terminos"
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                Términos y Condiciones
              </Link>
            </li>
            <li>
              <Link
                to="/privacidad"
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                Aviso de Privacidad
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Factio. Todos los derechos reservados.
      </div>
    </footer>
  );
}
