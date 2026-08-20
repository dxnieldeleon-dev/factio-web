// Placeholder visual del Hero del homepage — simula un recibo/comprobante
// fiscal (borde inferior dentado tipo papel, montos monoespaciados, sello
// de timbrado) usando solo HTML/Tailwind y los tokens de color existentes.
// Pensado para reemplazarse por un screenshot real de la app sin tocar el
// layout de src/routes/index.tsx.

const LINE_ITEMS = [
  { label: "Diseño de logotipo", price: "$2,500" },
  { label: "Hosting anual", price: "$1,200" },
  { label: "Dominio .mx", price: "$600" },
];

// Simula el filo picado de un recibo de papel: una serie de muescas
// triangulares a lo largo del borde inferior.
const RECEIPT_CLIP_PATH =
  "polygon(0% 0%, 100% 0%, 100% 97%, 96% 100%, 92% 97%, 88% 100%, 84% 97%, 80% 100%, 76% 97%, 72% 100%, 68% 97%, 64% 100%, 60% 97%, 56% 100%, 52% 97%, 48% 100%, 44% 97%, 40% 100%, 36% 97%, 32% 100%, 28% 97%, 24% 100%, 20% 97%, 16% 100%, 12% 97%, 8% 100%, 4% 97%, 0% 100%)";

export function HeroMockup() {
  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div
        className="bg-surface px-6 pb-9 pt-7 shadow-lift"
        style={{ clipPath: RECEIPT_CLIP_PATH }}
      >
        <div className="text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-primary">FACTIO</p>
          <p className="mt-1 text-xs text-muted-foreground">CFDI 4.0 · Factura #0142</p>
        </div>

        <div className="mt-4 border-t border-dashed border-border" />

        <div className="mt-4 space-y-2.5 font-mono text-xs">
          {LINE_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <span className="truncate text-foreground/80">{item.label}</span>
              <span className="shrink-0 font-semibold">{item.price}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-dashed border-border" />

        <div className="mt-4 flex items-center justify-between font-mono">
          <span className="text-sm font-bold tracking-wide text-primary">TOTAL</span>
          <span className="text-base font-bold text-primary">$4,300 MXN</span>
        </div>

        <div className="mt-6 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
            ✓ Timbrada ante el SAT
          </span>
        </div>
      </div>
    </div>
  );
}
