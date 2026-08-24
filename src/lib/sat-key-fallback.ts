// Lógica pura de SatKeyPicker (src/components/sat-key-picker.tsx) para
// decidir si una selección corresponde al código comodín de COMMON_SAT_KEYS
// (01010101, "No existe en el catálogo") y qué texto de búsqueda le
// corresponde reportar. Vive aquí, separada del componente, para poder
// probarla con Vitest en entorno `node` sin jsdom/@testing-library —
// mismo patrón que el resto de src/lib/*.test.ts.
import type { SatItem } from "@/lib/sat-catalogs";

export const SAT_KEY_FALLBACK_CODE = "01010101";

export interface SatKeySelectionResult {
  code: string;
  // El texto que el usuario tenía en el buscador, solo cuando la selección
  // fue el código comodín; null para cualquier otra clave (nunca se reporta
  // nada en ese caso).
  fallbackSearchTerm: string | null;
}

export function resolveSatKeySelection(params: {
  code: string;
  searchValue: string;
}): SatKeySelectionResult {
  return {
    code: params.code,
    fallbackSearchTerm: params.code === SAT_KEY_FALLBACK_CODE ? params.searchValue : null,
  };
}

// Filtrado manual de la lista, en vez del filtro fuzzy por default de cmdk:
// con éste, un texto de búsqueda que no matchea nada (el caso exacto que
// justifica el tracking de fallback — el usuario no encontró su giro)
// también oculta el código comodín 01010101 de la lista, dejando al
// usuario sin forma de seleccionarlo justo cuando más lo necesita. Aquí el
// comodín (si existe en `items`) siempre queda visible al final,
// independientemente de si matchea el texto buscado.
export function filterSatKeyItems(items: SatItem[], searchValue: string): SatItem[] {
  const term = searchValue.trim().toLowerCase();
  if (!term) return items;

  const matches = items.filter(
    (item) => item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term),
  );
  if (matches.some((item) => item.code === SAT_KEY_FALLBACK_CODE)) return matches;

  const fallback = items.find((item) => item.code === SAT_KEY_FALLBACK_CODE);
  return fallback ? [...matches, fallback] : matches;
}
