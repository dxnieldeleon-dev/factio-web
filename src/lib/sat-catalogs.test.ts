import { describe, expect, it } from "vitest";
import {
  CFDI_USES,
  TAX_REGIMES,
  cfdiUsesForRegime,
  isCfdiUseCompatible,
  taxRegimesForPersonType,
} from "./sat-catalogs";

describe("isCfdiUseCompatible", () => {
  // Un caso compatible y uno incompatible por régimen, cubriendo 605, 616 y
  // los regímenes de persona física/moral más comunes que ya expone el
  // wizard — no los ~20 uno por uno.
  const cases: Array<{ regime: string; compatible: string; incompatible: string }> = [
    { regime: "605", compatible: "S01", incompatible: "G01" },
    { regime: "606", compatible: "G01", incompatible: "CN01" },
    { regime: "612", compatible: "D01", incompatible: "CN01" },
    { regime: "616", compatible: "D04", incompatible: "I01" },
    { regime: "621", compatible: "CP01", incompatible: "D01" },
    { regime: "625", compatible: "I04", incompatible: "CN01" },
    { regime: "626", compatible: "D10", incompatible: "CN01" },
    { regime: "601", compatible: "I02", incompatible: "D01" },
  ];

  for (const { regime, compatible, incompatible } of cases) {
    it(`régimen ${regime}: ${compatible} es compatible`, () => {
      expect(isCfdiUseCompatible(regime, compatible)).toBe(true);
    });
    it(`régimen ${regime}: ${incompatible} no es compatible`, () => {
      expect(isCfdiUseCompatible(regime, incompatible)).toBe(false);
    });
  }

  it("con régimen o uso nulo, no hay suficiente información para rechazar (devuelve true)", () => {
    expect(isCfdiUseCompatible(null, "G01")).toBe(true);
    expect(isCfdiUseCompatible("601", null)).toBe(true);
    expect(isCfdiUseCompatible(undefined, undefined)).toBe(true);
  });

  it("con un régimen desconocido (fuera del catálogo), no rechaza por falta de datos (devuelve true)", () => {
    expect(isCfdiUseCompatible("999", "G01")).toBe(true);
  });
});

describe("cfdiUsesForRegime", () => {
  it("un régimen conocido devuelve exactamente los usos permitidos por ese régimen", () => {
    const result = cfdiUsesForRegime("605");
    const codes = result.map((u) => u.code).sort();
    const expected = [
      "CP01",
      "S01",
      "D01",
      "D02",
      "D03",
      "D04",
      "D05",
      "D06",
      "D07",
      "D08",
      "D09",
      "D10",
    ].sort();
    expect(codes).toEqual(expected);
  });

  it("un régimen desconocido no lanza excepción y devuelve el catálogo completo", () => {
    expect(() => cfdiUsesForRegime("999")).not.toThrow();
    expect(cfdiUsesForRegime("999")).toEqual(CFDI_USES);
  });

  it("un régimen null no lanza excepción y devuelve el catálogo completo", () => {
    expect(() => cfdiUsesForRegime(null)).not.toThrow();
    expect(cfdiUsesForRegime(null)).toEqual(CFDI_USES);
    expect(cfdiUsesForRegime(undefined)).toEqual(CFDI_USES);
  });
});

describe("taxRegimesForPersonType", () => {
  it("física y moral devuelven listas distintas y no vacías", () => {
    const fisica = taxRegimesForPersonType("fisica");
    const moral = taxRegimesForPersonType("moral");
    expect(fisica.length).toBeGreaterThan(0);
    expect(moral.length).toBeGreaterThan(0);
    expect(fisica.map((r) => r.code).sort()).not.toEqual(moral.map((r) => r.code).sort());
  });

  it("física excluye regímenes exclusivos de moral (p. ej. 601)", () => {
    const fisica = taxRegimesForPersonType("fisica");
    expect(fisica.some((r) => r.code === "601")).toBe(false);
  });

  it("moral excluye regímenes exclusivos de física (p. ej. 605)", () => {
    const moral = taxRegimesForPersonType("moral");
    expect(moral.some((r) => r.code === "605")).toBe(false);
  });

  it("sin tipo de persona, no lanza excepción y devuelve el catálogo completo", () => {
    expect(() => taxRegimesForPersonType(null)).not.toThrow();
    expect(taxRegimesForPersonType(null)).toEqual(TAX_REGIMES);
    expect(taxRegimesForPersonType(undefined)).toEqual(TAX_REGIMES);
  });
});
