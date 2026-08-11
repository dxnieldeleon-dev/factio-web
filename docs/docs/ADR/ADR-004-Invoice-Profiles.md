# ADR-004

## Perfil de facturación por defecto (`invoice_profiles`)

Estado: Aceptado

## Contexto

La mayoría de los emisores de Factio facturan siempre con la misma
combinación de Tipo de Comprobante, Exportación, Moneda, Método de pago y
Forma de pago (ej. Ingreso · PUE · Transferencia · MXN — un nutriólogo que
siempre emite recibos de deducción personal). Antes de este cambio, el
Paso 3 del wizard (`StepReview` en `src/routes/_authenticated/invoices.new.tsx`)
mostraba estos 5 campos editables en cada factura, con los mismos defaults
hardcodeados (`"I"`, `"01"`, `"MXN"`, `"PUE"`, `"03"`). Repetirlos en cada
factura es fricción innecesaria y un riesgo real de error humano (ej.
seleccionar `PPD` por accidente en un flujo que nunca usa pago diferido).

## Decisión

- Nueva tabla `invoice_profiles` (migración
  `supabase/migrations/20260811211059_invoice_profiles.sql`), **anclada a
  `company_id` (el emisor), no a `user_id`**. `companies` no impone
  unicidad por usuario a nivel de esquema (solo un índice, no una
  constraint), y ya existe un campo `companies.is_default` sin usar que
  sugiere que el diseño original sí contemplaba más de un emisor por
  cuenta. Anclar el perfil de facturación al emisor evita tener que migrar
  esta tabla el día que eso se construya, sin costo hoy porque en la
  práctica cada usuario tiene un solo `company`.
- `is_default boolean NOT NULL DEFAULT true` + índice único parcial
  `UNIQUE(company_id) WHERE is_default` — deja el modelo preparado para que
  un emisor tenga más de un perfil a futuro (ej. "Servicios" vs "Venta de
  producto"), pero el MVP solo usa un perfil default por emisor y no hay UI
  para manejar varios todavía.
- **No se reutilizaron** las columnas `settings.default_cfdi_use` /
  `default_payment_form` / `default_payment_method` que ya existían en el
  esquema: están ancladas a `user_id`, no a `company_id`, y ningún código en
  `src/` las lee ni las escribe (`settings.tsx` solo maneja tema y
  notificaciones) — son deuda muerta previa a esta feature, no una
  implementación parcial que extender.
- `src/features/profile/invoice-profile.ts` centraliza `loadInvoiceProfile`
  / `saveInvoiceProfile`, usado tanto por el wizard como por la nueva
  pantalla `/profile/invoicing`.
- En el wizard, si el emisor tiene un perfil guardado, la tarjeta "Datos
  del comprobante" del Paso 3 arranca colapsada en un resumen tipo chip
  (mismo patrón visual que la tarjeta Receptor: card + botón "Editar", aquí
  "Opciones avanzadas"). Si nunca hubo perfil, el formulario se comporta
  exactamente igual que antes de este cambio — comportamiento opt-in, no
  forzado.
- Editar en modo avanzado **no sobreescribe el perfil guardado por
  default**: es una excepción puntual para esa factura. Un checkbox
  explícito "Guardar como mi valor por defecto de facturación" lo hace
  opt-in, y el guardado ocurre solo después de un timbrado exitoso (una
  factura que falla no debe dejar el perfil a medio actualizar).
- La validación existente (`validatePayment` sobre método/forma de pago)
  corre siempre sobre el estado real del formulario, nunca sobre lo que
  está visualmente oculto — si un perfil guardado alguna vez produjera una
  combinación inválida, el mismo `useEffect` que ya auto-abre la edición
  del Receptor cuando hay errores hace lo mismo con "Opciones avanzadas".
- Moneda restringida a MXN en la pantalla de configuración del perfil
  (`src/routes/_authenticated/profile.invoicing.tsx`) solo a nivel de
  formulario (el `<select>` únicamente ofrece MXN), sin `CHECK` en la base
  de datos. Motivo: el proyecto no tiene fuente de tipo de cambio en vivo
  (ver el comentario existente en `src/lib/duplicate-invoice.ts` sobre este
  gap) — el tipo de cambio siempre se captura a mano por factura. Un
  `CHECK` habría requerido otra migración el día que se resuelva ese gap;
  la restricción de UI se puede levantar sin tocar la base de datos.

## Por qué

- Anclar al emisor en vez de al usuario es la decisión de menor
  arrepentimiento: cuesta lo mismo hoy (1:1 en la práctica) y evita una
  migración de datos si Factio soporta multi-emisor más adelante.
- No sobreescribir por default (vs. guardar automáticamente cualquier
  edición) evita que una corrección puntual ("esta vez cobro en USD")
  contamine silenciosamente el default de todas las facturas futuras.
- Reutilizar el patrón visual del Receptor (resumen + Editar) en vez de
  inventar uno nuevo mantiene la consistencia del wizard y reduce la
  superficie de revisión.

## Consecuencias

- Sin cobertura de tests: el repositorio no tiene ningún framework de
  testing configurado hoy (ni Vitest ni Jest), y agregar uno quedó fuera de
  alcance de este cambio por decisión explícita — se deja como deuda
  pendiente en vez de bootstrapear un framework nuevo solo para esta
  feature.
- Revisar esta decisión cuando: (a) se construya soporte real de
  multi-emisor por cuenta (el modelo de datos ya está listo, falta UI para
  elegir emisor activo), o (b) se resuelva el gap de tipo de cambio en vivo
  (Banxico/SIE u otra fuente), momento en el que la restricción a MXN en
  `/profile/invoicing` se puede retirar sin migración.
