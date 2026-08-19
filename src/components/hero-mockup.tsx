// Placeholder visual del Hero del homepage — simula la pantalla de una
// factura dentro de un marco de teléfono usando solo HTML/Tailwind y los
// tokens de color existentes. Pensado para reemplazarse por un screenshot
// real de la app sin tocar el layout de src/routes/index.tsx.

const LINE_ITEMS = [
  { label: "Diseño de logotipo", price: "$2,500" },
  { label: "Hosting anual", price: "$1,200" },
  { label: "Dominio .mx", price: "$600" },
];

export function HeroMockup() {
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="rounded-[2.5rem] border-[10px] border-foreground/90 bg-foreground/90 p-1.5 shadow-lift">
        <div className="overflow-hidden rounded-[2rem] bg-surface">
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1.5 w-16 rounded-full bg-border" />
          </div>

          <div className="space-y-4 p-5 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Factura
                </p>
                <p className="text-lg font-bold tracking-tight">#0142</p>
              </div>
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                $4,300
              </span>
            </div>

            <div className="space-y-2">
              {LINE_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-6 shrink-0 rounded-lg bg-accent" />
                    <span className="truncate text-xs font-medium">{item.label}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold">{item.price}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-foreground py-3 text-center text-sm font-semibold text-background">
              Timbrar factura
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
