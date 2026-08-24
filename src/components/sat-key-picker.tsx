import { forwardRef, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { SatItem } from "@/lib/sat-catalogs";
import { filterSatKeyItems, resolveSatKeySelection } from "@/lib/sat-key-fallback";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type SatKeyPickerVariant = "default" | "compact";

// Trigger cerrado (botón "código — nombre"), idéntico en el branch de
// Popover (escritorio) y el de Drawer (móvil) — solo cambia el contenedor
// que lo abre, nunca su JSX. forwardRef + spread de ...props porque
// PopoverTrigger/DrawerTrigger usan asChild (Radix Slot clona este
// elemento inyectándole onClick/aria-*/ref) — sin esto el trigger se ve
// igual pero no abre nada.
const SatKeyTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    selected: SatItem | undefined;
    variant: SatKeyPickerVariant;
  }
>(({ selected, variant, className, ...props }, ref) => {
  const compact = variant === "compact";
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        compact
          ? "ff-mini flex items-center justify-between gap-1 text-left"
          : "ff-input flex items-center justify-between gap-2 text-left",
        className,
      )}
      {...props}
    >
      <span className={`min-w-0 flex-1 truncate ${compact ? "text-xs" : ""}`}>
        {selected ? (
          <>
            <span className="font-mono text-muted-foreground">{selected.code}</span> —{" "}
            {selected.name}
          </>
        ) : (
          <span className="text-muted-foreground">{compact ? "Buscar…" : "Buscar clave SAT…"}</span>
        )}
      </span>
      <ChevronsUpDown
        className={`shrink-0 text-muted-foreground ${compact ? "size-3.5" : "size-4"}`}
      />
    </button>
  );
});
SatKeyTrigger.displayName = "SatKeyTrigger";

// Buscador + lista (Command completo), compartido entre el Popover de
// escritorio y el Drawer de móvil — searchValue/onSearchValueChange vienen
// del padre porque este también los necesita para onFallbackSelected.
function SatKeyList({
  items,
  searchValue,
  onSearchValueChange,
  onSelect,
}: {
  items: SatItem[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onSelect: (item: SatItem) => void;
}) {
  // shouldFilter=false + filtro manual: el filtro fuzzy por default de cmdk
  // oculta TODOS los items (incluido el código comodín) cuando el texto
  // buscado no matchea nada — justo el caso que existe para capturar. Ver
  // filterSatKeyItems en sat-key-fallback.ts.
  const visibleItems = filterSatKeyItems(items, searchValue);
  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder="Busca por nombre o código…"
        value={searchValue}
        onValueChange={onSearchValueChange}
      />
      <CommandList>
        <CommandEmpty>Sin resultados. Prueba con otra palabra.</CommandEmpty>
        <CommandGroup>
          {visibleItems.map((item) => (
            <CommandItem
              key={item.code}
              value={`${item.code} ${item.name}`}
              onSelect={() => onSelect(item)}
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
  );
}

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
  variant?: SatKeyPickerVariant;
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const isMobile = useIsMobile();
  const selected = items.find((i) => i.code === value);

  // Único lugar que decide onChange + onFallbackSelected — se pasa igual a
  // SatKeyList sin importar si la selección ocurrió en el Popover o el
  // Drawer, así que ese tracking nunca queda duplicado entre los dos.
  function handleSelect(item: SatItem) {
    const result = resolveSatKeySelection({ code: item.code, searchValue });
    onChange(result.code);
    if (result.fallbackSearchTerm !== null) {
      onFallbackSelected?.(result.fallbackSearchTerm);
    }
    setOpen(false);
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <SatKeyTrigger selected={selected} variant={variant} />
        </DrawerTrigger>
        <DrawerContent className="max-h-[70vh]">
          <div className="px-4 pb-2 pt-1">
            <SatKeyList
              items={items}
              searchValue={searchValue}
              onSearchValueChange={setSearchValue}
              onSelect={handleSelect}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SatKeyTrigger selected={selected} variant={variant} />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <SatKeyList
          items={items}
          searchValue={searchValue}
          onSearchValueChange={setSearchValue}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
