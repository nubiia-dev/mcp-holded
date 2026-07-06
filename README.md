# MCP Holded

[![CI](https://github.com/nubiia-dev/mcp-holded/actions/workflows/ci.yml/badge.svg)](https://github.com/nubiia-dev/mcp-holded/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40nubiia%2Fmcp-holded.svg)](https://www.npmjs.com/package/@nubiia/mcp-holded)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/nubiia-dev/mcp-holded/branch/main/graph/badge.svg)](https://codecov.io/gh/nubiia-dev/mcp-holded)
[![by Nubiia](https://img.shields.io/badge/by-Nubiia-6C4EE3)](https://nubiia.es)

A Model Context Protocol (MCP) server for the Holded API. This server lets AI assistants like Claude interact with Holded's invoicing, accounting, contacts, products, treasury, HR, time tracking and more.

> Built and maintained by **[Nubiia](https://nubiia.es)** — automatización e integraciones con IA para negocios (MCP, Holded, Pipedrive y más). ¿Quieres algo así para tu empresa? Escríbenos en **[nubiia.es](https://nubiia.es)**.

## Features

This MCP server provides access to the Holded API v2 across all supported modules:

- **Documents** (16 tools): Create, list, update, delete invoices, estimates, credit notes, etc. Also pay, send, get PDF, ship items, and more.
- **Contacts** (7 tools): Manage clients and suppliers with attachments.
- **Products** (9 tools): Full product management including images and stock.
- **Treasuries** (3 tools): Manage legacy treasury accounts.
- **Treasury v2** (15 tools): Bank accounts, bank movements, cash movements, invoicing forecasts and reconciliation.
- **Expenses Accounts** (5 tools): Handle expense account categories.
- **Numbering Series** (4 tools): Configure document numbering.
- **Sales Channels** (5 tools): Manage sales channels.
- **Warehouses** (6 tools): Warehouse management.
- **Payments** (5 tools): Payment method configuration.
- **Taxes** (1 tool): Get available taxes.
- **Contact Groups** (5 tools): Organize contacts into groups.
- **Remittances** (2 tools): Access remittance data.
- **Services** (5 tools): Manage services.
- **Time Tracking** (3 tools): List time-tracking entries and project times (read and write).
- **Accounting** (2 tools, read-only): Get the chart of accounts and the daily ledger.
- **Ledger** (4 tools): List and create accounting/ledger entries.
- **Team/HR** (22 tools): Employee management, payroll records, employee time entries and clock in/out.

**Total: 119 tools** — all registered unconditionally once a valid v2 key is configured.

## Installation

### Prerequisites

- Node.js 22.14 or higher
- A Holded account with API access
- A Holded API v2 key (`pat_…` or `sk_live_…`) — generate it in **Holded → Settings → API**

### Install from npm

```bash
npm install -g @nubiia/mcp-holded
```

### Install from source

```bash
git clone https://github.com/nubiia-dev/mcp-holded.git
cd mcp-holded
npm install
npm run build
```

## Configuration

### Environment Variables

All tools call the Holded API v2 (Bearer auth, cursor pagination). You need a single v2 key:

```bash
# Recommended — primary key name
export HOLDED_API_KEY=pat_your_v2_key_here

# Alternative — accepted as an alias; wins over HOLDED_API_KEY if both are set
export HOLDED_API_KEY_V2=sk_live_your_v2_key_here
```

Generate the key in **Holded → Settings → API**. The key must start with `pat_` or `sk_live_`. A `403` response means the key is missing a required scope.

For multi-tenant setups use the same logic per tenant:

```bash
export TENANT_1_NAME=company-a
export TENANT_1_API_KEY=pat_key_for_company_a
export TENANT_2_NAME=company-b
export TENANT_2_API_KEY=sk_live_key_for_company_b
```

`TENANT_N_API_KEY_V2` is accepted as an alias for `TENANT_N_API_KEY` (wins if both are set).

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "holded": {
      "command": "npx",
      "args": ["-y", "@nubiia/mcp-holded"],
      "env": {
        "HOLDED_API_KEY": "pat_your_v2_key_here"
      }
    }
  }
}
```

Or if installed from source:

```json
{
  "mcpServers": {
    "holded": {
      "command": "node",
      "args": ["/path/to/mcp-holded/dist/index.js"],
      "env": {
        "HOLDED_API_KEY": "pat_your_v2_key_here"
      }
    }
  }
}
```

## Migrating from 1.x

### API key

The server now calls the Holded API v2 exclusively. Your 1.x API key (a plain hex string like `abc123…`) **no longer works**. Generate a v2 key in **Holded → Settings → API**; the key will start with `pat_` or `sk_live_`.

Set it as `HOLDED_API_KEY` (or the alias `HOLDED_API_KEY_V2`). The separate `HOLDED_API_KEY_V2` variable used in 1.x to opt-in to HR/Ledger/Treasury tools is no longer needed — all 119 tools are always registered.

### Pagination

List tools changed from page-based to cursor-based pagination:

| 1.x argument | 2.x argument | Notes |
|---|---|---|
| `page` | *(removed)* | Server no longer accepts offset pages |
| `pageSize` | `limit` | Server-paginated; use limit to control page size |
| *(none)* | `cursor` | Pass the `nextCursor` from the previous response |

Responses now follow this envelope:

```json
{
  "items": [...],
  "nextCursor": "opaque-string-or-null",
  "hasMore": true
}
```

Iterate by passing `nextCursor` as `cursor` until `hasMore` is `false`.

### Response format

- Field names are `snake_case` throughout (e.g. `contact_id`, `created_at`).
- Monetary amounts are **strings** with a decimal comma (e.g. `"1.234,56"`) — parse with your locale-aware number parser before doing arithmetic.

### Removed or changed operations

| Operation | 1.x behaviour | 2.x behaviour |
|---|---|---|
| `purchaserefund` list/get/update/delete/pay | Supported | **Removed** — create only via `/purchases/refund` |
| `update_document` tracking | All document types | Only `salesorder` and `waybill` |
| Ship operations | All document types | Only `salesorder` and `purchaseorder` |
| Experimental banking (`reconcile_bank_transaction`) | Opt-in via env flag | **Removed** — use `reconcile_bank_movement` (treasury v2) |
| `get_daily_ledger` dates | Unix timestamps (`starttmp`/`endtmp`) | ISO 8601 strings (`start_date`/`end_date`); legacy Unix args still accepted as a convenience |
| `get_taxes` | Paginated | Returns all taxes in one call (no pagination args) |
| `update_product_stock` | Optional warehouse | `warehouse_id` is now required |
| List tools field projections | Reduced default set of fields | Full v2 payload returned; use `fields` argument to filter |

### Contact attachments

Attachments are now fetched by **filename** instead of attachment ID. Use `get_contact_attachment` with the `filename` field returned by `list_contact_attachments`.

## Usage Examples

Once configured, you can ask Claude to:

### Documents

- "List all my invoices from Holded"
- "Create an invoice for client X with 2 items"
- "Send invoice #123 to the client by email"
- "Get the PDF of invoice #456"
- "Mark invoice #789 as paid"

### Contacts

- "List all my clients in Holded"
- "Create a new client named Acme Corp"
- "Update the email for contact #123"

### Products

- "Show me all products"
- "Create a new product called Widget with price 50 EUR"
- "Update stock for product #123 adding 10 units in warehouse W1"

### HR & Payroll

- "List all employees"
- "Clock in employee #456"
- "Get the salary record for employee #789 for June 2025"

### Reports

- "Get all my taxes"
- "List all treasury bank accounts"
- "Show me the daily ledger for January 2025"
- "Get the chart of accounts"

## Document Types

The API supports these document types:

| Type | Description |
|------|-------------|
| `invoice` | Sales invoices |
| `salesreceipt` | Sales receipts |
| `creditnote` | Credit notes (refunds) |
| `receiptnote` | Receipt notes |
| `estimate` | Estimates/Quotes |
| `salesorder` | Sales orders |
| `waybill` | Packing lists |
| `proform` | Proforma invoices |
| `purchase` | Purchases |
| `purchaserefund` | Purchase refunds (create only in v2) |
| `purchaseorder` | Purchase orders |

## API Reference

### Base URL

```
https://api.holded.com/api/
```

The server routes each tool to the appropriate v2 sub-path (e.g. `/invoicing/v2/`, `/team/v2/`, `/accounting/v2/`).

### Authentication

All requests use Bearer authentication with your v2 key:

```
Authorization: Bearer pat_your_v2_key_here
```

### Pagination

List endpoints use cursor-based pagination via `limit` and `cursor` arguments (see [Migrating from 1.x](#migrating-from-1x)).

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Write Safety

Create/update/delete tools modify real data in Holded. The server applies per-tool rate limits (stricter for destructive operations) to prevent accidental bulk mutations. Destructive operations are capped at 10 requests/minute by default; update operations at 30 requests/minute.

## Privacy Policy

**Data Collection**: This MCP server requires your Holded API key to function. The API key is read from your local environment variable (`HOLDED_API_KEY`) and is never stored by this server. All API requests and responses are passed through in real-time to facilitate communication between your AI assistant and the Holded API.

**Data Usage & Sharing**: Your API key and all data processed through this server are used exclusively to interact with the Holded API on your behalf. The server acts as a pass-through proxy - it does not store, log, or retain any data. Your Holded API key and data are transmitted only to Holded's official API endpoints (api.holded.com). No data is shared with any third parties beyond Holded.

**Your Security**: We recommend following security best practices: store your API key in environment variables (never commit it to version control), regularly update to the latest version, and review the permissions granted to this MCP server in your AI assistant. For more information, see our [full Privacy Policy](PRIVACY.md).

## Support

For questions, issues, or feature requests:

- **GitHub Issues**: [Report an issue](https://github.com/nubiia-dev/mcp-holded/issues)
- **Email**: hola@nubiia.es
- **Documentation**: [Holded API Docs](https://developers.holded.com/reference/documents)

## About Nubiia

This MCP server is built and maintained by **[Nubiia](https://nubiia.es)**.

[Nubiia](https://nubiia.es) ayuda a empresas a **automatizar procesos e integrar sus herramientas con IA**: servidores MCP a medida, integraciones con [Holded](https://nubiia.es), Pipedrive y otros ERPs/CRMs, y agentes que conectan tus datos de negocio con asistentes como Claude. Este `@nubiia/mcp-holded` es un ejemplo open source de lo que hacemos.

👉 ¿Quieres una integración o automatización con IA para tu negocio? **[nubiia.es](https://nubiia.es)** · ✉️ [hola@nubiia.es](mailto:hola@nubiia.es)

## License

MIT - See [LICENSE](LICENSE) file for details.

## Author

Built by **[Nubiia](https://nubiia.es)** — [nubiia.es](https://nubiia.es) · [hola@nubiia.es](mailto:hola@nubiia.es)

Maintainer: Samuel Fraga — [GitHub](https://github.com/iamsamuelfraga) · [LinkedIn](https://www.linkedin.com/in/samuel-fraga/)

## Links

- [Nubiia — AI automation & integrations](https://nubiia.es)
- [Holded API Documentation](https://developers.holded.com/reference/documents)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Privacy Policy](PRIVACY.md)
