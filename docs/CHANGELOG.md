# Changelog

Todos los cambios importantes del proyecto serán documentados aquí. Formato
libre, orden cronológico descendente. No sigue SemVer porque Factio no
publica versiones — se despliega de forma continua.

## 2026-08-11

- **Perfil de facturación por defecto.** Nueva tabla `invoice_profiles`
  (por emisor, no por usuario — ver ADR-004) para guardar el Tipo de
  Comprobante/Exportación/Moneda/Método/Forma de pago habituales de cada
  negocio. El Paso 3 del wizard de nueva factura precarga esos valores y
  colapsa la tarjeta "Datos del comprobante" a un resumen tipo chip, con un
  toggle "Opciones avanzadas" para editarlos sin alterar el default (salvo
  que se marque explícitamente "Guardar como mi valor por defecto de
  facturación", y solo tras un timbrado exitoso). Nueva pantalla
  `/profile/invoicing` para configurar el perfil fuera del flujo de
  facturación. Si el emisor nunca configuró un perfil, el wizard se
  comporta exactamente igual que antes (opt-in, no forzado).

## 2026-07-30

- **Reconciliación de timbrados fallidos.** `facturama-create-cfdi` ya no
  pierde el Id del CFDI de Facturama cuando falla un paso posterior al
  timbrado (descarga o guardado de XML/PDF); ya no libera el timbre
  reservado ante un error 4xx si el CFDI ya se había generado (evita un
  riesgo latente de timbrar la misma venta dos veces). Nuevas funciones SQL
  `finalize_cfdi_stamp_reconciliation` / `release_cfdi_stamp_reconciliation`
  y la Edge Function `facturama-reconcile-cfdi` resuelven facturas
  atascadas en `stamping_status = 'reconciliation_required'`, de forma
  automática cuando se conoce el CFDI, o con confirmación humana cuando no.
  Historial ahora muestra estas facturas con acciones para resolverlas.
- **Suscripciones y saldo de timbres sincronizados a git.** Las Edge
  Functions `create-checkout-session` y `stripe-webhook` existían
  desplegadas directamente en Supabase pero nunca se habían llevado al
  repositorio; se corrigió además un bug real (el checkout redirigía a
  `/perfil`, ruta inexistente — la app usa `/profile`). Se agregó la
  migración de las tablas `plans`/`subscriptions`/`stamp_wallets`/
  `stamp_transactions` (existían solo en la base viva).
- **Corregido descuento doble de timbre.** `finalize_cfdi_stamp` restaba el
  saldo del wallet manualmente *y* insertaba en `stamp_transactions`, cuyo
  trigger aplicaba el mismo descuento otra vez — cada factura timbrada
  consumía 2 timbres en vez de 1.
- **Cerrado un hueco de seguridad en el wallet de timbres.**
  `consume_invoice_stamp`, `fn_consume_stamp` y `reverse_invoice_stamp` no
  validaban que la empresa perteneciera a quien llama, y tenían `EXECUTE`
  otorgado a `anon`/`authenticated`/`PUBLIC` — cualquiera podía vaciar o
  inflar el saldo de timbres de cualquier empresa vía RPC. Acceso
  restringido a `service_role`.
- **Limpieza de funciones huérfanas.** Retirados `validar-csd` (duplicado de
  `validate-csd` que nunca registraba el CSD ante Facturama pese a aceptar
  la contraseña), y dos despliegues sueltos de `facturama-upload-csd`
  (versión legacy que aceptaba certificado/llave privada crudos del
  cliente). Eliminado también `src/lib/facturama/*`, resto de un backend en
  TanStack Start Server Functions abandonado en favor de las Edge
  Functions.
- Documentación (`Architecture.md`, ADR-001/002/003, este changelog)
  actualizada para reflejar la arquitectura real en vez de quedar como
  plantillas vacías.

## 2026-07-29

- Cancelación de CFDI: columnas de seguimiento (`cancellation_status`,
  `cancellation_requested_at`, `cancellation_replacement_uuid`,
  `cancellation_pac_response`) y la función `finalize_cfdi_cancellation`.
- Facturas inmutables una vez `issued`: RLS reescrita para que solo se
  puedan crear/editar/borrar facturas en estado `draft`; cambios de estado
  posteriores solo vía funciones `SECURITY DEFINER`.
- Timbrado idempotente: `stamping_status` (`ready` → `processing` →
  `completed`/`reconciliation_required`) y `reserved_stamps` en
  `stamp_wallets`, para que dos solicitudes simultáneas de timbrado no
  consuman el mismo timbre dos veces. Folio asignado atómicamente por
  trigger (`assign_invoice_folio`, con `pg_advisory_xact_lock`).
- Eliminada la columna `csd_password_encrypted`: la contraseña del CSD
  nunca debe persistir, solo se usa en memoria para validar y registrar
  ante el PAC.

## 2026-07-22

- Timbrado en producción: bucket privado `cfdi-documents`, columna
  `pac_response`, y la primera versión de `finalize_cfdi_stamp` (más tarde
  corregida el 2026-07-30 por el descuento doble).
- Seguimiento de vigencia del CSD: `csd_status`, `csd_uploaded_at`,
  `csd_last_error`, `csd_serial_number`, `csd_valid_from/to`.

## 2026-06-26 — 2026-07-07

- Esquema inicial: `companies`, `clients`, `products`, `invoices`,
  `invoice_items`, `payments`, `settings`, `notifications`,
  `activity_logs`, `user_roles`.
- Buckets privados de Storage para CSD y logos de empresa, con políticas
  por `user_id`.
- Endurecimiento de roles: solo administradores pueden asignar/editar
  roles de usuario; `activity_logs` solo se escribe desde `service_role`.
