# Migración completa a Holded API v2 (mcp-holded 2.0.0)

**Fecha:** 2026-07-06
**Estado:** Borrador para revisión

## Contexto y decisiones tomadas

Tras el soporte parcial v2 de la 1.8.0, se decide migrar TODAS las tools a la
API v2 de Holded. Decisiones cerradas con Samu:

- **v2-only con major bump (2.0.0).** Las tools llaman exclusivamente a v2.
  Sin fallback a v1. Breaking release documentado.
- **Paginación por cursor nativa.** Las tools de listado exponen `limit` +
  `cursor` y devuelven `{ items, nextCursor?, hasMore }`. Desaparece la
  interfaz `page`/`pageSize` con paginación virtual (era un workaround del
  comportamiento v1 "el servidor lo devuelve todo"; en v2 el servidor pagina
  de verdad con tope de 100 items/llamada).
- **`purchaserefund` reducido a creación.** v2 solo documenta
  `POST /purchases/refund`; el resto de operaciones sobre ese tipo devuelven
  un error explicativo.
- **Verificación contra cuenta real.** Hay clave v2 (`pat_…`) configurada
  localmente (`.env.v2.local`, fuera de git). Confirmado en vivo: envelope de
  listados `{ items, cursor, has_more }` con cursor string (`"page:2"`),
  campos `snake_case`, importes como string con coma decimal (`"460,00"`),
  `sales-orders` con guion (`salesorders` → 404), `receipt-notes` y
  `purchase-shipments` son recursos distintos.

## Anexos normativos (mapeo v1→v2 verificado)

El detalle ruta a ruta vive en cuatro anexos generados verificando las
páginas individuales de la doc oficial (el índice contiene errores):

- `.superpowers/sdd/v2-mapping/sales-documents.md` — documentos (11 docTypes)
- `.superpowers/sdd/v2-mapping/inventory.md` — productos, stock, almacenes
- `.superpowers/sdd/v2-mapping/contacts-finance.md` — contactos, pagos, etc.
- `.superpowers/sdd/v2-mapping/projects-accounting-banking.md` — proyectos,
  contabilidad, banking

Estos ficheros se copian a `docs/superpowers/specs/v2-mapping/` como parte de
esta spec (fuente de verdad de rutas durante la implementación).

## Cliente (`holded-client.ts`)

- `API_BASES` queda reducido a `v2: 'https://api.holded.com/api/v2'`. Se
  eliminan `invoicing`, `projects`, `accounting` e `internal`. El parámetro
  `apiGroup` desaparece de la API pública del cliente.
- **Credenciales:** `HOLDED_API_KEY` pasa a ser la clave v2 (`pat_…` /
  `sk_live_…`). `HOLDED_API_KEY_V2` se acepta como alias con prioridad (si
  ambas existen, gana `_V2`) para transiciones suaves desde 1.8. Multi-tenant:
  `TENANT_N_API_KEY` (v2) con alias `TENANT_N_API_KEY_V2`.
- Header único: `Authorization: Bearer <key>`. El header `key:` desaparece.
- Nuevo método `patch()` (lo exige `update_warehouse`, y cualquier otro
  recurso que la doc marque como PATCH).
- Retry/backoff sin cambios. La pista de scopes en 403 pasa a aplicarse
  siempre (todo es v2).
- `uploadFile` se migra al mecanismo de adjuntos v2 del recurso
  correspondiente (rutas en el anexo de documentos); si un recurso no tiene
  adjuntos en v2, la operación se elimina con error claro.

## Paginación (`v2-pagination.ts`)

- **Bugfix obligatorio:** `normalizeV2List` no reconoce el envelope real
  (`cursor` como string plano + `has_more`). Se reescribe contra el formato
  verificado: `{ items, cursor, has_more }` → `{ items, nextCursor?, hasMore }`.
  Se mantienen los fallbacks existentes por robustez y se eliminan del
  resultado los campos crudos de cursor.
- `cursorParams` sin cambios (`limit`, `cursor`).
- Este fix es candidato a backport 1.8.x independiente de la 2.0.

## Tools — reglas generales de migración

1. **Los nombres de tools no cambian** salvo eliminación justificada. La
   rotura para el consumidor se concentra en: argumentos de paginación
   (`page`/`pageSize` → `limit`/`cursor`), formatos de respuesta v2
   (`snake_case`, importes string con coma), y operaciones eliminadas.
2. Respuestas **passthrough**: no se convierten formatos (ni camelCase ni
   números). Las descripciones de las tools documentan el formato v2.
3. Se conservan las conveniencias `fields` y `summary` donde existan hoy,
   aplicadas sobre la página devuelta (no sobre el dataset completo).
4. Toda operación v1 sin equivalente v2 se elimina y, si la tool sobrevive
   con otras operaciones, el docType/parámetro no soportado devuelve:
   `"<op> on <resource> is not supported by the Holded API v2"`.

## Tools — puntos específicos (detalle completo en anexos)

- **`documents.ts` (mantiene tools genéricas):** router interno
  `docType → recurso v2` (invoice→`/invoices`, estimate→`/estimates`,
  proform→`/proformas`, salesreceipt→`/sales-receipts`,
  creditnote→`/credit-notes`, salesorder→`/sales-orders`,
  waybill→`/waybills`, purchase→`/purchases`,
  purchaseorder→`/purchase-orders`, purchaserefund→solo create
  (`POST /purchases/refund`), receiptnote→**pendiente de probe en vivo**
  (candidatos `/purchase-shipments` vs `/receipt-notes`; ambos existen y
  están vacíos en la cuenta — se decide durante implementación creando un
  albarán de compra de prueba en v1 y localizándolo en v2, o consultando a
  Holded). Matriz explícita de operaciones soportadas por tipo; el resto,
  error claro.
- **`products.ts`:** `warehouse_id` obligatorio en update de stock (la tool
  lo exige en su schema). Imágenes según anexo de inventario.
- **`warehouses.ts`:** update vía PATCH.
- **`contacts.ts`:** adjuntos por `{filename}` en vez de `{attachmentId}`
  (cambia el argumento de la tool, documentado).
- **`remittances.ts`:** rutas bajo `/treasury/remittances`.
- **`accounting.ts`:** `get_chart_of_accounts` → `GET /accounting-accounts`;
  `get_daily_ledger` → `GET /ledger-entries` con `start_date`/`end_date` ISO
  obligatorios — la tool acepta fechas ISO y convierte si recibe los
  timestamps Unix legacy (`starttmp`/`endtmp`) para suavizar la rotura.
  `ledger.ts` (1.8) se fusiona aquí; además `list_ledger_entries` gana los
  parámetros de fecha que hoy le faltan (evita el 422 detectado).
- **`time-tracking.ts`:** reescritura del shaping — v2 devuelve lista plana
  con cursor, no la estructura anidada `project.timeTracking[]`.
- **`banking.ts` se elimina** junto al flag
  `HOLDED_ENABLE_EXPERIMENTAL_BANKING`: la conciliación oficial v2
  (`reconcile_bank_movement`, payload `{documents: [...]}`) lo sustituye.
- **`team.ts`, `treasury-v2.ts`:** ya son v2; solo se actualizan al
  normalizador corregido y al cliente v2-only. `treasury-v2.ts` pasa a
  llamarse conceptualmente el módulo de tesorería único (el `treasuries.ts`
  v1 migra o se fusiona según el anexo de contactos-finanzas).

## Registro (`index.ts`)

- Desaparece el gating `ANY_TENANT_HAS_V2`/`hasV2`: todas las tools se
  registran siempre (solo hay v2). El error de configuración del cliente
  cubre la falta de clave.
- Rate limits: se conservan y se completan los `delete_*`/`update_*` v2 que
  faltaban (follow-up anotado en la review de la 1.8).

## Verificación

1. **Suite unitaria** migrada (mocks con envelope real `{items, cursor,
   has_more}` y rutas v2 de los anexos).
2. **Probe script read-only** (`scripts/verify-v2.mjs`, fuera del paquete
   npm): recorre un GET de listado por recurso contra la cuenta real usando
   `.env.v2.local` e informa ruta/status/envelope. Gate manual antes del
   release. Las escrituras NO se prueban automatizadas contra la cuenta real.
3. Smoke test MCP (tools/list y una llamada de lectura end-to-end).

## Release

- Commit de cierre con `feat!:` + footer `BREAKING CHANGE:` para que
  semantic-release publique **2.0.0**.
- README: sección de migración 1.x → 2.0 (clave v2 obligatoria, cambios de
  paginación, formatos v2, operaciones eliminadas, tabla resumen).
- CHANGELOG generado por semantic-release; la sección de migración del README
  es la referencia humana.

## Fuera de alcance

- Módulos v2 aún no cubiertos: CRM, Calendario, Inbox, tarifas, órdenes de
  producción, etiquetas, uso de API, tareas de proyectos. (Candidatos a 2.1.)
- Conversión de formatos (importes numéricos, camelCase): passthrough.

## Riesgos aceptados

- `receiptnote` ambiguo hasta el probe en vivo (bloquea solo ese docType).
- Campos de payload de escritura no siempre documentados con ejemplo — las
  escrituras siguen siendo passthrough (`data` verbatim) donde el anexo no
  acredite el schema.
- La clave usada para verificación quedó expuesta en el chat de esta sesión:
  rotarla al terminar la migración.
