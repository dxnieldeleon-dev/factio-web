import { describe, expect, it } from "vitest";
import {
  RFC_GENERIC_FOREIGN,
  RFC_GENERIC_NATIONAL,
  classifyRfc,
  hasErrors,
  normalizeFiscalName,
  validatePayment,
  validateReceiverProfile,
  validateRfcStrict,
  type ReceiverProfile,
} from "./fiscal";

// RFC de ejemplo válidos usados en varios tests de este archivo:
// - Persona física (13): prefijo de 4 letras + AAMMDD + homoclave de 3.
// - Persona moral (12): prefijo de 3 letras + AAMMDD + homoclave de 3.
const VALID_PHYSICAL_RFC = "PEPJ800101ABC";
const VALID_MORAL_RFC = "ABC850101XY1";

describe("classifyRfc", () => {
  it("clasifica un RFC de persona física (13 caracteres)", () => {
    expect(classifyRfc(VALID_PHYSICAL_RFC)).toBe("physical");
  });

  it("clasifica un RFC de persona moral (12 caracteres)", () => {
    expect(classifyRfc(VALID_MORAL_RFC)).toBe("moral");
  });

  it("clasifica el RFC genérico nacional", () => {
    expect(classifyRfc(RFC_GENERIC_NATIONAL)).toBe("generic_national");
  });

  it("clasifica el RFC genérico extranjero", () => {
    expect(classifyRfc(RFC_GENERIC_FOREIGN)).toBe("generic_foreign");
  });

  it("marca como inválido un RFC demasiado corto", () => {
    expect(classifyRfc("ABC1234")).toBe("invalid");
  });

  it("marca como inválido un RFC con caracteres no permitidos en el prefijo", () => {
    // "1" en el prefijo no es letra ni Ñ/& — no cumple [A-ZÑ&]{3,4}.
    expect(classifyRfc("1BC850101XY1")).toBe("invalid");
  });

  // NOTA: classifyRfc solo exige que el bloque de fecha sean 6 dígitos
  // (\d{6}) — no valida que representen una fecha real (no revisa mes
  // 01-12 ni día válido). Este caso cubre lo que el código sí hace hoy
  // (rechazar cuando ese bloque no son puros dígitos), no una validación
  // de calendario que el módulo no implementa. Ver hallazgo documentado
  // en el resumen de este cambio: un RFC con mes "13" en esa posición
  // (p. ej. "PEPJ801301ABC") pasa como "physical" en vez de "invalid".
  it("marca como inválido cuando el bloque de fecha no son 6 dígitos", () => {
    expect(classifyRfc("PEPJ8A0101ABC")).toBe("invalid");
  });

  it("normaliza minúsculas y espacios antes de clasificar", () => {
    expect(classifyRfc(`  ${VALID_PHYSICAL_RFC.toLowerCase()}  `)).toBe("physical");
  });
});

describe("validateRfcStrict", () => {
  it("rechaza un RFC vacío", () => {
    const result = validateRfcStrict("");
    expect(result.valid).toBe(false);
    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/obligatorio/i);
  });

  it("rechaza un RFC demasiado corto", () => {
    const result = validateRfcStrict("ABC12345");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/12 \(moral\) o 13 caracteres \(física\)/);
  });

  it("rechaza un RFC demasiado largo", () => {
    const result = validateRfcStrict("ABCDE850101XY123");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/12 \(moral\) o 13 caracteres \(física\)/);
  });

  it("acepta un RFC de persona física válido", () => {
    expect(validateRfcStrict(VALID_PHYSICAL_RFC)).toEqual({ valid: true, kind: "physical" });
  });

  it("acepta un RFC de persona moral válido", () => {
    expect(validateRfcStrict(VALID_MORAL_RFC)).toEqual({ valid: true, kind: "moral" });
  });

  it("acepta el RFC genérico nacional", () => {
    expect(validateRfcStrict(RFC_GENERIC_NATIONAL)).toEqual({
      valid: true,
      kind: "generic_national",
    });
  });

  it("acepta el RFC genérico extranjero", () => {
    expect(validateRfcStrict(RFC_GENERIC_FOREIGN)).toEqual({
      valid: true,
      kind: "generic_foreign",
    });
  });
});

function baseProfile(overrides: Partial<ReceiverProfile> = {}): ReceiverProfile {
  return {
    rfc: VALID_MORAL_RFC,
    legal_name: "Empresa de Prueba SA",
    tax_regime: "601",
    postal_code: "01000",
    cfdi_use: "G03",
    ...overrides,
  };
}

describe("validateReceiverProfile", () => {
  it("con RFC genérico nacional y régimen distinto de 616, marca error en tax_regime", () => {
    const errors = validateReceiverProfile(
      baseProfile({ rfc: RFC_GENERIC_NATIONAL, tax_regime: "601", cfdi_use: "S01" }),
    );
    expect(errors.tax_regime).toBeDefined();
    expect(errors.cfdi_use).toBeUndefined();
  });

  it("con RFC genérico nacional y uso CFDI distinto de S01, marca error en cfdi_use", () => {
    const errors = validateReceiverProfile(
      baseProfile({ rfc: RFC_GENERIC_NATIONAL, tax_regime: "616", cfdi_use: "G03" }),
    );
    expect(errors.cfdi_use).toBeDefined();
    expect(errors.tax_regime).toBeUndefined();
  });

  it("con RFC genérico nacional y CP distinto al del emisor, marca error en postal_code", () => {
    const errors = validateReceiverProfile(
      baseProfile({
        rfc: RFC_GENERIC_NATIONAL,
        tax_regime: "616",
        cfdi_use: "S01",
        postal_code: "01000",
      }),
      "64000",
    );
    expect(errors.postal_code).toBeDefined();
    expect(errors.postal_code).toMatch(/64000/);
  });

  it("con RFC genérico nacional y mismo CP que el emisor, no marca error en postal_code", () => {
    const errors = validateReceiverProfile(
      baseProfile({
        rfc: RFC_GENERIC_NATIONAL,
        tax_regime: "616",
        cfdi_use: "S01",
        postal_code: "64000",
      }),
      "64000",
    );
    expect(errors.postal_code).toBeUndefined();
  });

  it("con RFC normal sin régimen ni uso CFDI, marca ambos errores", () => {
    const errors = validateReceiverProfile(baseProfile({ tax_regime: null, cfdi_use: null }));
    expect(errors.tax_regime).toBeDefined();
    expect(errors.cfdi_use).toBeDefined();
  });

  it("con RFC normal y régimen/uso incompatibles, marca error solo en cfdi_use", () => {
    // Régimen 605 (Sueldos y Salarios) no admite G01 según CFDI_USE_BY_REGIME.
    const errors = validateReceiverProfile(baseProfile({ tax_regime: "605", cfdi_use: "G01" }));
    expect(errors.cfdi_use).toBeDefined();
    expect(errors.tax_regime).toBeUndefined();
  });

  it("marca error en legal_name cuando falta y en postal_code cuando no son 5 dígitos", () => {
    const errors = validateReceiverProfile(baseProfile({ legal_name: "  ", postal_code: "123" }));
    expect(errors.legal_name).toBeDefined();
    expect(errors.postal_code).toBeDefined();
  });

  it("caso válido completo no produce ningún error", () => {
    const errors = validateReceiverProfile(baseProfile());
    expect(hasErrors(errors)).toBe(false);
    expect(errors).toEqual({});
  });
});

describe("validatePayment", () => {
  it("PPD con forma distinta de 99 es un error", () => {
    expect(validatePayment("PPD", "03")).toMatch(/PPD/);
  });

  it("PUE con forma 99 es un error", () => {
    expect(validatePayment("PUE", "99")).toMatch(/PUE/);
  });

  it("PPD con forma 99 es válido", () => {
    expect(validatePayment("PPD", "99")).toBeNull();
  });

  it("PUE con forma distinta de 99 es válido", () => {
    expect(validatePayment("PUE", "03")).toBeNull();
  });
});

describe("normalizeFiscalName", () => {
  it("quita acentos y pasa a mayúsculas", () => {
    expect(normalizeFiscalName("García López")).toBe("GARCIA LOPEZ");
  });

  it("elimina 'S.A. de C.V.' al final del nombre", () => {
    expect(normalizeFiscalName("Constructora ABC, S.A. de C.V.")).toBe("CONSTRUCTORA ABC");
  });

  it("elimina variantes de régimen de capital con puntuación parcial", () => {
    expect(normalizeFiscalName("Servicios XYZ SA DE CV")).toBe("SERVICIOS XYZ");
  });

  it("colapsa espacios múltiples", () => {
    expect(normalizeFiscalName("Juan   Pérez    López")).toBe("JUAN PEREZ LOPEZ");
  });

  it("devuelve cadena vacía para entrada vacía", () => {
    expect(normalizeFiscalName("")).toBe("");
  });
});
