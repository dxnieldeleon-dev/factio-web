export const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMXN(value: number | string | null | undefined) {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "$0.00";
  return mxn.format(n);
}

export function formatDateMX(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" })
    .format(d)
    .replace(".", "")
    .toUpperCase();
}

export function formatDateLong(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

const relativeTimeMX = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

// Más de una semana atrás deja de leerse natural como relativo ("hace 12
// días" es más ambiguo que una fecha) — cae a la fecha corta habitual.
export function formatRelativeMX(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "Justo ahora";
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (abs >= unitSeconds) {
      if (unit === "week" || unit === "month" || unit === "year") break;
      return relativeTimeMX.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return formatDateMX(d);
}

const RFC_PATTERN = /^([A-ZÑ&]{3,4})(\d{6})([A-Z\d]{3})$/i;
export function validateRFC(rfc: string): { valid: boolean; reason?: string } {
  const v = rfc.trim().toUpperCase();
  if (!v) return { valid: false, reason: "RFC requerido" };
  if (v.length < 12 || v.length > 13)
    return { valid: false, reason: "El RFC debe tener 12 o 13 caracteres" };
  if (!RFC_PATTERN.test(v)) return { valid: false, reason: "Formato de RFC no válido" };
  return { valid: true };
}
