import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

type PricingCardProps = {
  name: string;
  price: string;
  features: string[];
  ctaLabel: string;
  highlighted?: boolean;
};

export function PricingCard({ name, price, features, ctaLabel, highlighted }: PricingCardProps) {
  return (
    <div
      className={
        highlighted
          ? "relative rounded-3xl border-2 border-primary bg-surface p-6 shadow-lift md:scale-105"
          : "relative rounded-3xl border border-border bg-surface p-6 shadow-soft"
      }
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          Más popular
        </span>
      )}

      <h3 className="font-semibold">{name}</h3>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">MXN/mes</span>
      </p>

      <ul className="mt-6 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/auth"
        search={{ mode: "signup" }}
        className={
          highlighted
            ? "mt-6 flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            : "mt-6 flex items-center justify-center gap-2 rounded-full border border-border bg-background py-3 text-sm font-semibold transition hover:bg-accent"
        }
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
