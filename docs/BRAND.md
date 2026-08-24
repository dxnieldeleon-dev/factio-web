# Factio Brand v1

Fuente única de verdad para la paleta de color oficial y la tipografía
confirmada del producto. Cualquier prompt o feature nueva que necesite estos
valores (incluyendo el panel de administración en Lovable, que es un repo
aparte) debería referenciar este documento en vez de que se le vuelva a
pegar la especificación de marca cada vez.

Estado: Vigente (v1). Paleta confirmada por extracción de píxel del isotipo
real. Tipografía de la app confirmada en código; ver la sección de
tipografía para una discrepancia pendiente que **no está resuelta**.

## Paleta oficial

De más oscuro a más claro. Los tokens ya viven como CSS custom properties en
`src/styles.css` (bloque `@theme inline`), lo que los expone como utilidades
de Tailwind (`bg-brand-primary`, `text-brand-ink`, etc.) sin depender del
tema claro/oscuro — a diferencia de `--primary`, `--background`, etc., que sí
cambian entre `:root` y `.dark`, estos 5 son valores fijos de marca.

| # | Hex | oklch | Token | Uso sugerido |
|---|-----|-------|-------|--------------|
| 1 | `#011025` | `oklch(0.173 0.050 253.5)` | `--color-brand-ink` | Fondos oscuros, texto de alto contraste |
| 2 | `#052659` | `oklch(0.281 0.100 259.3)` | `--color-brand-primary` | Color del isotipo; color de marca primario |
| 3 | `#5482B4` | `oklch(0.595 0.092 251.5)` | `--color-brand-accent` | Acentos secundarios, elementos interactivos |
| 4 | `#7EA0C5` | `oklch(0.694 0.066 250.9)` | `--color-brand-soft` | Superficies suaves, estados hover/disabled |
| 5 | `#C2E8FF` | `oklch(0.911 0.051 234.7)` | `--color-brand-highlight` | Fondos claros, resaltados sutiles |

Nota: estos 5 tokens son la fuente de verdad de la marca, no un reemplazo de
los tokens semánticos existentes (`--primary`, `--background`, `--accent`,
etc.) que ya usan los componentes de la app — esos siguen siendo los que se
usan en la UI del día a día. Este paso **no** reemplazó ningún color en
componentes existentes; es solo la referencia canónica para features nuevas.

## Tipografía

Estado actual confirmado en `src/routes/__root.tsx` / `src/styles.css`:

- **Cuerpo / UI**: Inter
- **Monoespaciada** (datos fiscales, UUID, RFC, montos tabulares, etc.):
  JetBrains Mono

### Decisión abierta — NO resolver sin confirmación

Existe una propuesta alternativa de tipografía (Fraunces + Inter + IBM Plex
Mono) que ya está en uso en la landing page pública (factio.mx), pero **no
está confirmada para la app**. Esto es una discrepancia pendiente entre la
landing y el producto, no un error — no cambiar la tipografía de la app en
base a este documento ni a ningún prompt derivado de él sin que el dueño del
producto lo confirme explícitamente.

## Nombre anterior — auditoría

Se auditó el repo completo (código, comentarios, strings de UI, metadata,
nombres de archivo, `package.json`, historial de mensajes de commit) en
busca de referencias al nombre anterior del producto ("Factura Fácil" /
"FactuFast", con o sin acentos/guiones). **Resultado: cero ocurrencias.** El
repo ya está limpio de ese nombre; no hay limpieza pendiente de este tipo.
