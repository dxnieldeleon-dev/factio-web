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
}: {
  value: string;
  onChange: (code: string) => void;
  items: SatItem[];
  // Se dispara además de onChange cuando se elige el código comodín
  // (01010101, "No existe en el catálogo"), con el texto que el usuario
  // tenía escrito en el buscador en ese momento. El componente no sabe qué
  // hace el caller con ese texto (telemetría, log, nada) — solo lo expone.
  onFallbackSelected?: (searchTerm: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const selected = items.find((i) => i.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ff-input flex items-center justify-between gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              <>
                <span className="font-mono text-muted-foreground">{selected.code}</span> —{" "}
                {selected.name}
              </>
            ) : (
              <span className="text-muted-foreground">Buscar clave SAT…</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
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
