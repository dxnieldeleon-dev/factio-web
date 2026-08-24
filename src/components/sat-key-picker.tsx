import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { SatItem } from "@/lib/sat-catalogs";
import { resolveSatKeySelection } from "@/lib/sat-key-fallback";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function SatKeyPicker({
  value,
  onChange,
  items,
  onFallbackSelected,
  variant = "default",
}: {
  value: string;
  onChange: (code: string) => void;
  items: SatItem[];
  // Se dispara además de onChange cuando se elige el código comodín
  // (01010101, "No existe en el catálogo"), con el texto que el usuario
  // tenía escrito en el buscador en ese momento. El componente no sabe qué
  // hace el caller con ese texto (telemetría, log, nada) — solo lo expone.
  onFallbackSelected?: (searchTerm: string) => void;
  // "default": trigger ff-input (products.new/edit). "compact": trigger
  // ff-mini, para encajar en celdas angostas como el grid de 3 columnas
  // del renglón de factura (invoices.new.tsx) — mismo popover/lista en
  // ambos casos, solo cambia el tamaño del trigger cerrado.
  variant?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const selected = items.find((i) => i.code === value);
  const compact = variant === "compact";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            compact
              ? "ff-mini flex items-center justify-between gap-1 text-left"
              : "ff-input flex items-center justify-between gap-2 text-left"
          }
        >
          <span className={`min-w-0 flex-1 truncate ${compact ? "text-xs" : ""}`}>
            {selected ? (
              <>
                <span className="font-mono text-muted-foreground">{selected.code}</span> —{" "}
                {selected.name}
              </>
            ) : (
              <span className="text-muted-foreground">
                {compact ? "Buscar…" : "Buscar clave SAT…"}
              </span>
            )}
          </span>
          <ChevronsUpDown
            className={`shrink-0 text-muted-foreground ${compact ? "size-3.5" : "size-4"}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Busca por nombre o código…"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>Sin resultados. Prueba con otra palabra.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.code}
                  value={`${item.code} ${item.name}`}
                  onSelect={() => {
                    const result = resolveSatKeySelection({ code: item.code, searchValue });
                    onChange(result.code);
                    if (result.fallbackSearchTerm !== null) {
                      onFallbackSelected?.(result.fallbackSearchTerm);
                    }
                    setOpen(false);
                  }}
                >
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                    {item.code}
                  </span>
                  <span className="truncate">{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
