# Soporte API v2 de Holded en mcp-holded

**Fecha:** 2026-07-06
**Estado:** Aprobado

## Contexto

Holded lanzó en junio de 2026 su API v2 (GA): base URL unificada
`https://api.holded.com/api/v2`, autenticación `Authorization: Bearer <api-key>`
con permisos por scope (p. ej. `accounting:payrolls.read`), paginación por
cursor y ~330 endpoints frente a los ~136 de v1. La v1 queda obsoleta pero
sigue operativa sin fecha de apagado anunciada.

El conector está construido íntegramente sobre v1 (`invoicing/v1`,
`projects/v1`, `accounting/v1` + API interna experimental de banking). La
decisión es **mantener v1 intacta** y añadir soporte v2 solo para módulos que
v1 no cubre.

## Alcance

### Incluido (fase 1)

| Módulo v2 | Recursos | Escritura |
|---|---|---|
| Equipo y RRHH | Empleados (+contrato), fichajes, registros de nómina | CRUD completo |
| Contabilidad | Asientos (ledger entries), cuentas contables | Crear + listar |
| Tesorería | Cuentas bancarias, movimientos, conciliación, previsiones de facturación | CRUD completo |

### Excluido (deliberado)

- Recursos v2 ya cubiertos por tools v1: payments, taxes, expenses-accounts,
  payment-methods, remittances, contactos, documentos, productos, etc. Siguen
  en v1 sin cambios.
- CRM, Calendario, Inbox, inventario avanzado (órdenes de producción).
- Migración de tools existentes a v2.
- Deprecación de `banking.ts` (API interna): se mantiene tal cual; se marcará
  deprecated en una fase posterior, cuando la tesorería v2 esté verificada con
  cuenta real.

## Arquitectura

### Cliente (`src/holded-client.ts`) — enfoque A: extender `apiGroup`

- Nuevo grupo en `API_BASES`: `v2: 'https://api.holded.com/api/v2'`.
- Constructor: `new HoldedClient(apiKey: string, apiKeyV2?: string)`.
- Headers por grupo:
  - Grupos v1 (`invoicing`, `projects`, `accounting`, `internal`):
    `key: <apiKey>` (sin cambios).
  - Grupo `v2`: `Authorization: Bearer <apiKeyV2>`.
- Si una tool v2 se invoca sin `apiKeyV2`, el cliente lanza un error claro:
  indica configurar `HOLDED_API_KEY_V2` con una clave `sk_live_…` generada en
  Ajustes → API con los scopes necesarios.
- Errores 403 en grupo `v2` se enriquecen con una pista sobre permisos por
  scope de la clave.
- Retry/backoff existente (429/502/503/504, 3 intentos, backoff exponencial)
  se reutiliza sin cambios para v2.

### Configuración y registro de tools

- Nueva env var opcional `HOLDED_API_KEY_V2`. `HOLDED_API_KEY` sigue siendo
  obligatoria y exclusiva de v1.
- En `src/index.ts`, las tools v2 **solo se registran si `HOLDED_API_KEY_V2`
  está definida**. Usuarios actuales no ven ningún cambio en el listado de
  tools.

### Paginación por cursor

- Las tools de listado v2 aceptan `limit` y `cursor` opcionales.
- La respuesta de la tool incluye `nextCursor` cuando hay más páginas.
- El servidor no acumula páginas: el patrón es idéntico en espíritu a la doble
  paginación actual (pagina el servidor, decide el cliente MCP).
- El nombre exacto del parámetro/campo de cursor se confirmará contra la doc
  v2 durante la implementación; si la API devuelve otro nombre (p. ej.
  `next`), la tool lo normaliza a `nextCursor`.

## Tools nuevas (41)

### `src/tools/team.ts` — Equipo y RRHH

Empleados:
- `list_employees` — GET `/employees`
- `get_employee` — GET `/employees/{employeeId}`
- `create_employee` — POST `/employees`
- `update_employee` — PUT `/employees/{employeeId}`
- `delete_employee` — DELETE `/employees/{employeeId}`
- `get_employee_contract` — GET `/employees/{employeeId}/contract`
- `update_employee_contract` — PUT `/employees/{employeeId}/contract`

Fichajes (control horario):
- `clock_in_employee` — POST `/employees/{employeeId}/clock-in`
- `clock_out_employee` — POST `/employees/{employeeId}/clock-out`
- `pause_employee` — POST `/employees/{employeeId}/pause`
- `unpause_employee` — POST `/employees/{employeeId}/unpause`
- `list_employee_times` — GET `/employee-times` (y por empleado:
  GET `/employees/{employeeId}/times` vía parámetro opcional `employeeId`)
- `get_employee_time` — GET `/employee-times/{timeId}`
- `create_employee_time` — POST `/employees/{employeeId}/times`
- `update_employee_time` — PUT `/employee-times/{timeId}`
- `delete_employee_time` — DELETE `/employee-times/{timeId}`

Registros de nómina:
- `list_salary_records` — GET `/salary-records`
- `get_salary_record` — GET `/salary-records/{salaryRecordId}`
  (confirmado: scope `accounting:payrolls.read`; devuelve líneas de
  devengos/deducciones, totales y estado PENDING/PAID/PARTIALLY_PAID)
- `create_salary_record` — POST `/salary-records`
- `update_salary_record` — PUT `/salary-records/{salaryRecordId}`
- `delete_salary_record` — DELETE `/salary-records/{salaryRecordId}`
- `get_salary_record_defaults` — endpoint "datos por defecto" (ruta exacta a
  confirmar en la doc durante implementación)

### `src/tools/ledger.ts` — Contabilidad escritura (v2)

- `list_ledger_entries` — GET `/ledger-entries`
- `create_ledger_entry` — POST `/ledger-entries`
- `list_accounting_accounts` — GET `/accounting-accounts`
- `create_accounting_account` — POST `/accounting-accounts`

Los tools v1 `get_chart_of_accounts` y `get_daily_ledger` se mantienen sin
cambios; los nombres nuevos no colisionan.

### `src/tools/treasury-v2.ts` — Tesorería oficial (v2)

Cuentas bancarias:
- `list_bank_accounts` — GET `/treasury/accounts`
- `get_bank_account` — GET `/treasury/accounts/{id}`
- `create_bank_account` — POST `/treasury/accounts`
- `update_bank_account` — PUT `/treasury/accounts/{id}`
- `delete_bank_account` — DELETE `/treasury/accounts/{id}`
- `archive_bank_account` — POST `/treasury/accounts/{id}/archive`

Movimientos:
- `list_bank_movements` — GET `/treasury/accounts/{id}/bank-movements`
- `create_bank_movement` — POST `/treasury/accounts/{id}/bank-movements`
- `reconcile_bank_movement` — POST
  `/treasury/accounts/{id}/bank-movements/{movementId}/reconcile`
- `list_cash_movements` — GET `/treasury/accounts/{id}/cash-movements`

Previsiones de facturación:
- `list_invoicing_forecasts` — GET `/treasury/cashflow/invoicing-forecasts`
- `get_invoicing_forecast` — GET `/treasury/cashflow/invoicing-forecasts/{forecastId}`
- `create_invoicing_forecast` — POST `/treasury/cashflow/invoicing-forecasts`
- `update_invoicing_forecast` — PUT `/treasury/cashflow/invoicing-forecasts/{forecastId}`
- `delete_invoicing_forecast` — DELETE `/treasury/cashflow/invoicing-forecasts/{forecastId}`

Las tools de escritura llevan en su descripción la advertencia de write-safety
habitual del repo (afectan a datos contables/laborales reales).

## Manejo de errores

- Reutiliza el formato de error actual (`Holded API error (status): body`).
- 403 en v2 → mensaje ampliado: "la clave HOLDED_API_KEY_V2 no tiene el scope
  requerido por este endpoint".
- Tool v2 sin clave v2 → error de configuración antes de hacer red.

## Testing

Siguiendo el patrón de `src/__tests__` (mock de fetch):

1. El grupo `v2` construye URL base `https://api.holded.com/api/v2` y header
   `Authorization: Bearer …`; los grupos v1 siguen enviando `key: …`.
2. Tool v2 sin `HOLDED_API_KEY_V2` → error de configuración, sin llamada de red.
3. `index.ts` no registra tools v2 si falta la env var; las registra si existe.
4. Paginación: `limit`/`cursor` se propagan como query params y `nextCursor`
   se devuelve normalizado.
5. Retry en 429 también aplica al grupo v2.
6. Tests representativos por fichero de tools (una tool de lectura y una de
   escritura por módulo, no las 34).

## Documentación

- README: nueva sección "Holded API v2 (Equipo/RRHH, Contabilidad, Tesorería)"
  con: cómo generar la clave v2 con scopes, tabla de tools nuevas, nota de que
  v1 sigue siendo la base del resto del conector.
- `.env.example` (o equivalente en README): añadir `HOLDED_API_KEY_V2`.
- Actualizar la sección de write-safety con los módulos nuevos.

## Riesgos y verificaciones pendientes

- Rutas y payloads exactos de crear/actualizar nómina y "defaults" se
  verificarán contra la doc oficial durante la implementación (el GET
  individual está confirmado; el resto se infirió de la navegación de la doc).
- Formato exacto del cursor de paginación v2: a confirmar con la primera
  llamada real.
- No está confirmado si las claves v1 funcionan en v2; el diseño asume claves
  independientes, que es el caso seguro.
