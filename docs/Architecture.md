# Factio Architecture v1.0

Documento oficial de arquitectura del proyecto Factio.

Estado: Vigente. Describe el sistema tal como está implementado y desplegado, no un diseño aspiracional.

## Resumen

Factio es una app de facturación (CFDI 4.0) para negocios mexicanos. Un usuario
configura su empresa emisora, sube su Certificado de Sello Digital (CSD), da de
alta clientes y productos, y emite facturas que se timbran ante el SAT a través
de un PAC (Facturama). El acceso a timbrar está condicionado a una suscripción
de pago (Stripe) que recarga un "monedero de timbres" mensual.

## Stack

- **Frontend**: React 19 + TanStack Start/Router (rutas basadas en archivos,
  ver `src/routes/README.md`) + Tailwind + shadcn/ui. Mobile-first.
- **Backend**: Supabase Edge Functions (Deno), invocadas desde el cliente vía
  `supabase.functions.invoke(...)`. No hay un servidor Node/Express propio.
- **Base de datos**: PostgreSQL (Supabase), con Row Level Security en todas las
  tablas de negocio y lógica transaccional crítica implementada como funciones
  `SECURITY DEFINER` en SQL, no en las Edge Functions.
- **PAC**: Facturama (sandbox/producción vía `FACTURAMA_ENV`).
- **Cobros**: Stripe (suscripciones recurrentes), vía Checkout + webhook.

## Flujo de negocio

1. **Onboarding**: el usuario captura sus datos fiscales (`profile.fiscal`) y
   sube su CSD (`profile.csd` → Edge Function `validate-csd`), que valida el
   certificado/llave localmente (Node `crypto`) y lo registra en Facturama
   Multiemisor antes de marcar la empresa como lista para timbrar.
2. **Suscripción**: sin una suscripción activa y saldo de timbres > 0, el
   dashboard bloquea la emisión de facturas. El usuario elige un plan
   (`profile.tsx`), se crea una sesión de Stripe Checkout
   (`create-checkout-session`), y el webhook de Stripe (`stripe-webhook`)
   activa la suscripción y otorga los timbres del periodo.
3. **Catálogo**: clientes (`clients.*`) y productos (`products.*`), con claves
   SAT (`sat_key`, `sat_unit`, `iva_rate`) para armar conceptos válidos.
4. **Emisión**: el wizard de `invoices.new` arma el borrador y sus conceptos
   en la base de datos: el cliente **nunca** construye el CFDI. Al confirmar,
   invoca `facturama-create-cfdi`, que:
   - reconstruye el CFDI en el servidor a partir de la factura, la empresa y
     el cliente (nunca confía en montos ni claves enviados por el cliente),
   - reserva un timbre de forma atómica (`claim_cfdi_stamp`),
   - llama a Facturama, descarga XML/PDF y los guarda en Storage privado,
   - finaliza la factura y descuenta el timbre en una sola transacción
     (`finalize_cfdi_stamp`).
   - si el cliente tiene correo capturado, envía automáticamente una copia
     del CFDI (PDF y XML adjuntos) vía Resend (`_shared/invoice-email.ts`,
     usado también por la Edge Function `send-invoice-email` para el
     reenvío manual desde el detalle de factura). Es *best-effort*: un
     fallo de envío nunca revierte ni bloquea el timbrado ya confirmado,
     solo se registra en `invoices.email_last_error`
     (`invoices.email_sent_at` marca el último envío exitoso).
5. **Cancelación**: `facturama-cancel-cfdi` solicita la cancelación ante
   Facturama con el motivo SAT correspondiente; la factura solo pasa a
   `cancelled` si el PAC confirma.
6. **Reconciliación**: si `facturama-create-cfdi` no puede confirmar el
   resultado del timbrado (falla de red, 5xx, o un error después de que
   Facturama ya devolvió un CFDI), la factura queda en
   `stamping_status = 'reconciliation_required'` en vez de reintentarse a
   ciegas — un reintento automático podría duplicar el CFDI ante el SAT. La
   Edge Function `facturama-reconcile-cfdi` resuelve estos casos: de forma
   automática cuando ya se conoce el CFDI de Facturama, o mediante
   confirmación humana (`confirm_stamped`/`confirm_not_stamped`) cuando no.
   La sección "Requieren conciliación" en Historial expone esta acción.

## Modelo de datos (tablas relevantes)

- `companies`, `clients`, `products`: catálogo del usuario.
- `invoices`, `invoice_items`: facturas y sus conceptos. Una factura es
  inmutable una vez `issued` — solo funciones `SECURITY DEFINER` la modifican.
- `plans`, `subscriptions`: catálogo de planes y la suscripción de Stripe por
  empresa.
- `stamp_wallets`, `stamp_transactions`: saldo de timbres por empresa. El saldo
  (`stamp_wallets.balance`) es siempre una proyección del historial de
  `stamp_transactions` — un trigger (`fn_update_stamp_wallet`) es la única
  vía para modificarlo. Ningún código debe hacer `UPDATE stamp_wallets SET
  balance = ...` directamente: se duplicaría el ajuste.
- `settings`, `notifications`, `activity_logs`: preferencias y auditoría.

## Seguridad

- RLS en todas las tablas de negocio, filtrando siempre por dueño
  (`user_id`/`company_id` vía `auth.uid()`).
- Las funciones `SECURITY DEFINER` (timbrado, cancelación, wallet) además
  validan `user_id = auth.uid()` en su propio cuerpo — no dependen solo del
  grant de ejecución — y se restringe `EXECUTE` a `authenticated`.
- Las tablas de facturación/suscripción (`plans`, `subscriptions`,
  `stamp_wallets`, `stamp_transactions`) no otorgan `INSERT`/`UPDATE`/`DELETE`
  a `anon`/`authenticated`: solo se escriben desde el webhook de Stripe
  (con la service role key) o desde las funciones `SECURITY DEFINER`.
- Los archivos CSD y los XML/PDF de CFDI viven en buckets privados de
  Storage, particionados por `user_id`.

## Fuera del alcance actual (deuda conocida)

- `supabase/functions/shared/` (domain models, value objects, validators,
  errors, logger, etc.) es scaffolding de una exploración arquitectónica
  temprana (ver historial de commits). **Ningún Edge Function lo importa** —
  la lógica real vive inline en cada función y en `_shared/facturama/` (el
  cliente HTTP de Facturama, que sí se usa). No tratar `shared/` como la
  arquitectura vigente.
- El PAC (Facturama) está aislado a nivel de protocolo HTTP/errores
  (`_shared/facturama/client.ts`), pero el payload del CFDI usa directamente
  los nombres de campo de Facturama — cambiar de PAC implicaría reescribir
  esa capa, no solo el cliente. Ver ADR-002.
- Solo se soportan CFDI de tipo Ingreso ("I"); notas de crédito no están
  implementadas.
- No hay un proceso automático (cron) que dispare la reconciliación de
  timbrados; hoy es manual desde la app.
- El envío de correo (Resend) no reintenta automáticamente ante un fallo —
  el usuario debe reenviar manualmente desde el detalle de factura. No hay
  plantillas configurables (un solo template fijo) ni tracking de
  apertura/clics, y solo cubre el timbrado exitoso (no cancelación ni
  conciliación).
