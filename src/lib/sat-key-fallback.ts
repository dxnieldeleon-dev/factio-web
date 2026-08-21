// Lógica pura de SatKeyPicker (src/components/sat-key-picker.tsx) para
// decidir si una selección corresponde al código comodín de COMMON_SAT_KEYS
// (01010101, "No existe en el catálogo") y qué texto de búsqueda le
// corresponde reportar. Vive aquí, separada del componente, para poder
// probarla con Vitest en entorno `node` sin jsdom/@testing-library —
// mismo patrón que el resto de src/lib/*.test.ts.
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
