import { describe, expect, it } from "vitest";
import { parseConstanciaText } from "./constancia-parser";

// Los fixtures imitan el texto plano tal como quedaría tras extraer el PDF
// de una Constancia de Situación Fiscal real del SAT (layout de
// etiqueta:valor, una por línea) — no requieren un PDF real, solo el texto
// ya extraído, que es lo único que parseConstanciaText recibe.

const MORAL_CONSTANCIA = `
Constancia de Situación Fiscal
RFC: ABC850101XY1
CURP:
Denominación/Razón Social: COMERCIALIZADORA EJEMPLO SA DE CV
Régimen Capital: SOCIEDAD ANONIMA
Fecha de inicio de operaciones: 01/01/2020
Estatus en el padrón: ACTIVO
Fecha de último cambio de estado: 01/01/2020
Código Postal: 64000
Tipo de vialidad: CALLE
Nombre de vialidad: REFORMA
Número Exterior: 123
Número Interior:
Nombre de la colonia: CENTRO
Nombre de la localidad: MONTERREY
Nombre del municipio o delegación: MONTERREY
Nombre de la entidad federativa: NUEVO LEON
Entre calle:
Y calle:
Regímenes:
Régimen General de Ley Personas Morales Fecha Inicio 01/01/2020
Actividades Económicas:
Comercio al por mayor de equipo de computo Fecha Inicio 01/01/2020
Obligaciones:
Declaración anual
`;

const PHYSICAL_CONSTANCIA = `
Constancia de Situación Fiscal
RFC: PEPJ800101ABC
CURP: PEPJ800101HDFXXX01
Nombre (s): JUAN
Primer Apellido: PEREZ
Segundo Apellido: JIMENEZ
Régimen Capital:
Fecha de inicio de operaciones: 01/01/2019
Estatus en el padrón: ACTIVO
Fecha de último cambio de estado: 01/01/2019
Código Postal: 06600
Tipo de vialidad: AVENIDA
Nombre de vialidad: INSURGENTES
Número Exterior: 45
Número Interior:
Nombre de la colonia: ROMA NORTE
Nombre de la localidad: CIUDAD DE MEXICO
Nombre del municipio o delegación: CUAUHTEMOC
Nombre de la entidad federativa: CIUDAD DE MEXICO
Entre calle:
Y calle:
Regímenes:
Régimen de Sueldos y Salarios Fecha Inicio 01/01/2019
Actividad Económica:
Prestación de servicios profesionales Fecha Inicio 01/01/2019
Obligaciones:
Declaración anual
`;

// Texto deliberadamente incompleto/mal formado: sin RFC reconocible, sin
// Código Postal, y con un régimen que no coincide con ningún alias conocido
// — cubre "campo ausente o mal formado" sin que el parser lance excepción.
const INCOMPLETE_CONSTANCIA = `
RFC: SIN DATOS DISPONIBLES
Denominación/Razón Social: EMPRESA SIN REGIMEN DETECTABLE SA
Regímenes:
Algún régimen no reconocido por el sistema
`;

describe("parseConstanciaText", () => {
  it("extrae todos los campos de una constancia de persona moral completa", () => {
    const result = parseConstanciaText(MORAL_CONSTANCIA);
    expect(result.rfc).toBe("ABC850101XY1");
    expect(result.legalName).toBe("COMERCIALIZADORA EJEMPLO SA DE CV");
    expect(result.postalCode).toBe("64000");
    expect(result.taxRegimeCode).toBe("601");
    expect(result.activityText).toContain("EQUIPO DE COMPUTO");
  });

  it("arma el nombre de una persona física a partir de nombre(s) + apellidos, en orden natural", () => {
    const result = parseConstanciaText(PHYSICAL_CONSTANCIA);
    expect(result.rfc).toBe("PEPJ800101ABC");
    expect(result.legalName).toBe("JUAN PEREZ JIMENEZ");
    expect(result.postalCode).toBe("06600");
    expect(result.taxRegimeCode).toBe("605");
    expect(result.activityText).toContain("SERVICIOS PROFESIONALES");
  });

  it("con campos ausentes o mal formados, no lanza excepción y deja esos campos en null", () => {
    expect(() => parseConstanciaText(INCOMPLETE_CONSTANCIA)).not.toThrow();
    const result = parseConstanciaText(INCOMPLETE_CONSTANCIA);
    expect(result.rfc).toBeNull();
    expect(result.postalCode).toBeNull();
    expect(result.taxRegimeCode).toBeNull();
    expect(result.activityText).toBeNull();
    // Hallazgo real, no corregido a propósito (ver restricciones de este
    // cambio): captureField corta en la primera coincidencia de CUALQUIER
    // KNOWN_LABEL, incluida la palabra suelta "REGIMEN" — así que una razón
    // social que contenga esa palabra ("...SIN REGIMEN DETECTABLE...") se
    // trunca ahí en vez de capturarse completa. Se documenta este límite en
    // vez de "arreglarlo" silenciosamente dentro de un cambio de solo tests.
    expect(result.legalName).toBe("EMPRESA SIN");
  });

  it("con texto vacío, no lanza excepción y devuelve todos los campos en null", () => {
    expect(() => parseConstanciaText("")).not.toThrow();
    expect(parseConstanciaText("")).toEqual({
      rfc: null,
      legalName: null,
      postalCode: null,
      taxRegimeCode: null,
      activityText: null,
    });
  });
});
