import { describe, expect, it } from "vitest";
import { SAT_KEY_FALLBACK_CODE, resolveSatKeySelection } from "./sat-key-fallback";

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
