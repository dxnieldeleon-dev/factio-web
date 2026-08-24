import { describe, expect, it } from "vitest";
import {
  SAT_KEY_FALLBACK_CODE,
  filterSatKeyItems,
  resolveSatKeySelection,
} from "./sat-key-fallback";
import type { SatItem } from "@/lib/sat-catalogs";

const ITEMS: SatItem[] = [
  { code: SAT_KEY_FALLBACK_CODE, name: "No existe en el catálogo" },
  { code: "84111506", name: "Servicios de facturación" },
  { code: "82101500", name: "Servicios de publicidad" },
];

describe("resolveSatKeySelection", () => {
  it("reporta el término de búsqueda cuando se elige el código comodín (01010101)", () => {
    const result = resolveSatKeySelection({
      code: SAT_KEY_FALLBACK_CODE,
      searchValue: "servicios de jardinería",
    });
    expect(result.code).toBe("01010101");
    expect(result.fallbackSearchTerm).toBe("servicios de jardinería");
  });

  it("reporta cadena vacía si se elige el comodín sin haber escrito nada", () => {
    const result = resolveSatKeySelection({ code: SAT_KEY_FALLBACK_CODE, searchValue: "" });
    expect(result.fallbackSearchTerm).toBe("");
  });

  it("no reporta nada (null) al elegir cualquier otra clave", () => {
    const result = resolveSatKeySelection({
      code: "84111506",
      searchValue: "facturación",
    });
    expect(result.code).toBe("84111506");
    expect(result.fallbackSearchTerm).toBeNull();
  });

  it("no reporta nada aunque el texto buscado contenga el código comodín como substring", () => {
    const result = resolveSatKeySelection({
      code: "82101500",
      searchValue: "01010101 algo raro",
    });
    expect(result.fallbackSearchTerm).toBeNull();
  });
});

describe("filterSatKeyItems", () => {
  it("sin texto de búsqueda, regresa todos los items sin cambios", () => {
    expect(filterSatKeyItems(ITEMS, "")).toEqual(ITEMS);
  });

  it("con match real, regresa los items que matchean (por código o nombre), más el comodín al final", () => {
    const result = filterSatKeyItems(ITEMS, "facturación");
    expect(result.map((i) => i.code)).toEqual(["84111506", SAT_KEY_FALLBACK_CODE]);
  });

  it("busca también por código, y también deja el comodín al final", () => {
    const result = filterSatKeyItems(ITEMS, "82101500");
    expect(result.map((i) => i.code)).toEqual(["82101500", SAT_KEY_FALLBACK_CODE]);
  });

  it("sin ningún match real, deja visible el código comodín en vez de una lista vacía", () => {
    const result = filterSatKeyItems(ITEMS, "plomería a domicilio");
    expect(result.map((i) => i.code)).toEqual([SAT_KEY_FALLBACK_CODE]);
  });

  it("no duplica el comodín si ya está entre los matches reales", () => {
    const result = filterSatKeyItems(ITEMS, "no existe");
    expect(result.filter((i) => i.code === SAT_KEY_FALLBACK_CODE)).toHaveLength(1);
  });

  it("si el comodín no está en items, no lo inventa", () => {
    const withoutFallback = ITEMS.filter((i) => i.code !== SAT_KEY_FALLBACK_CODE);
    expect(filterSatKeyItems(withoutFallback, "nada que coincida")).toEqual([]);
  });
});
