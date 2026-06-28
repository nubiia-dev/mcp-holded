# MCP Holded

[![CI](https://github.com/nubiia-dev/mcp-holded/actions/workflows/ci.yml/badge.svg)](https://github.com/nubiia-dev/mcp-holded/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40nubiia%2Fmcp-holded.svg)](https://www.npmjs.com/package/@nubiia/mcp-holded)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/nubiia-dev/mcp-holded/branch/main/graph/badge.svg)](https://codecov.io/gh/nubiia-dev/mcp-holded)
[![by Nubiia](https://img.shields.io/badge/by-Nubiia-6C4EE3)](https://nubiia.es)

A Model Context Protocol (MCP) server for the Holded API. This server lets AI assistants like Claude interact with Holded's invoicing, accounting, contacts, products, treasury and more.

> Built and maintained by **[Nubiia](https://nubiia.es)** — automatización e integraciones con IA para negocios (MCP, Holded, Pipedrive y más). ¿Quieres algo así para tu empresa? Escríbenos en **[nubiia.es](https://nubiia.es)**.

## Features

This MCP server provides access to the complete Holded Invoice API:

- **Documents** (16 tools): Create, list, update, delete invoices, estimates, credit notes, etc. Also pay, send, get PDF, ship items, and more.
- **Contacts** (7 tools): Manage clients and suppliers with attachments.
- **Products** (9 tools): Full product management including images and stock.
- **Treasuries** (3 tools): Manage treasury accounts.
- **Expenses Accounts** (5 tools): Handle expense account categories.
- **Numbering Series** (4 tools): Configure document numbering.
- **Sales Channels** (5 tools): Manage sales channels.
- **Warehouses** (5 tools): Warehouse management.
- **Payments** (5 tools): Payment method configuration.
- **Taxes** (1 tool): Get available taxes.
- **Contact Groups** (5 tools): Organize contacts into groups.
- **Remittances** (2 tools): Access remittance data.
- **Services** (5 tools): Manage services.
- **Time Tracking** (2 tools, read-only): List time-tracking entries across projects or for a single project (Holded Projects API).
- **Accounting** (2 tools, read-only): Get the chart of accounts and the daily ledger.
- **Banking** (1 tool, experimental): Reconcile a bank-feed transaction against its accounting entry. Uses an undocumented internal Holded API; opt-in via `HOLDED_ENABLE_EXPERIMENTAL_BANKING=true`.

**Total: 76 tools** (+1 experimental banking tool, opt-in)

## Installation

### Prerequisites

- Node.js 22.14 or higher
- A Holded account with API access
- Your Holded API key (get it from Holded Settings > API)

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

### Environment Variable

Set your Holded API key:

```bash
export HOLDED_API_KEY=your_api_key_here
```

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
        "HOLDED_API_KEY": "your_api_key_here"
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
        "HOLDED_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

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
- "Update stock for product #123 adding 10 units"

### Reports

- "Get all my taxes"
- "List all treasuries"
- "Show me the sales channels"

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
| `purchaserefund` | Purchase refunds |
| `purchaseorder` | Purchase orders |

## API Reference

### Base URL

```
https://api.holded.com/api/invoicing/v1/
```

### Authentication

All requests use the `key` header with your API key.

### Pagination

List endpoints support pagination via the `page` query parameter.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

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
