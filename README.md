# MCP HTTP Proxy

A proxy server for the Model Context Protocol (MCP) that forwards Streamable HTTP transport requests to upstream MCP servers. This implementation follows the MCP specification version 2025-06-18.

## Features

- Full support for MCP Streamable HTTP transport (2025-06-18 specification)
- Proxies HTTP POST and GET requests to upstream MCP servers
- Session management with `Mcp-Session-Id` header support
- Server-Sent Events (SSE) streaming support
- Comprehensive logging with configurable levels and colors
- CORS protection against DNS rebinding attacks
- Error handling and graceful shutdown

## Prerequisites

- Node.js 18+
- npm
- A running MCP server with Streamable HTTP transport

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```bash
# Development mode
npm run dev

# Production
npm run build
npm start
```

### Command-line Options

```bash
Options:
  --port          Port to listen on [number] [default: 3000]
  --endpoint      Upstream MCP server endpoint URL [string]
                  [default: "http://localhost:8080/mcp"]
  --path          HTTP endpoint path for MCP requests [string] [default: "/mcp"]
  --help          Show help [boolean]

Examples:
  # Proxy on custom port with custom upstream
  npm run dev -- --port 3500 --endpoint http://localhost:9000/mcp

  # Use a different path for the MCP endpoint
  npm run dev -- --path /api/mcp
```

## Configuration

### Logging Configuration

The proxy uses a flexible logging system that can be configured via `logging.config.json` or environment variables.

**Default logging.config.json:**
```json
{
  "levels": {
    "CONNECTION": { "enabled": true, "color": "green", "showPayload": false },
    "REQUEST": { "enabled": true, "color": "cyan", "showPayload": true },
    "FORWARD": { "enabled": true, "color": "yellow", "showPayload": true },
    "RESPONSE": { "enabled": true, "color": "magenta", "showPayload": true },
    "SSE": { "enabled": false, "color": "blue", "showPayload": false },
    "ERROR": { "enabled": true, "color": "red", "showPayload": true },
    "DEBUG": { "enabled": false, "color": "gray", "showPayload": true },
    "SYSTEM": { "enabled": true, "color": "white", "showPayload": false }
  },
  "showTimestamps": true,
  "showPayloads": false
}
```

### Environment Variables

- `LOG_LEVELS`: Comma-separated list of enabled log levels (e.g., `CONNECTION,REQUEST,ERROR`)
- `LOG_COLORS`: Comma-separated list of level:color pairs (e.g., `CONNECTION:blue,ERROR:red`)
- `LOG_SHOW_PAYLOADS`: Global payload display setting (`true` or `false`)
- `LOG_PAYLOADS`: Per-level payload settings (e.g., `REQUEST:true,RESPONSE:false`)
- `LOG_SHOW_TIMESTAMPS`: Whether to show timestamps (`true` or `false`)

### Example Environment Variable Usage

```bash
# Show payloads only for REQUEST and FORWARD categories
LOG_PAYLOADS=REQUEST:true,FORWARD:true,RESPONSE:false npm run dev

# Enable all logs with payloads for debugging
LOG_LEVELS=CONNECTION,REQUEST,FORWARD,RESPONSE,SSE,DEBUG LOG_SHOW_PAYLOADS=true npm run dev

# Custom configuration with selective payloads
LOG_PAYLOADS=REQUEST:true,ERROR:true LOG_LEVELS=CONNECTION,REQUEST,ERROR,SYSTEM npm run dev
```

## Architecture

### MCP Streamable HTTP Transport

This proxy implements the MCP Streamable HTTP transport specification:

1. **POST Requests**: Clients send JSON-RPC messages via HTTP POST
   - Request header: `MCP-Protocol-Version: 2025-06-18`
   - Optional: `Mcp-Session-Id` header for stateful sessions
   - Body: Single JSON-RPC request, notification, or response
   - Response: Either HTTP 202, SSE stream, or JSON response

2. **GET Requests**: Clients can open SSE streams for server-initiated messages
   - Request header: `Accept: text/event-stream`
   - Response: SSE stream with server messages

```
[MCP Client] <--Streamable HTTP--> [This Proxy] <--Streamable HTTP--> [MCP Server]
```

The proxy handles:
- Protocol version validation
- Session management and validation
- Request/response forwarding with streaming support
- CORS protection for local servers
- Error handling and logging

## API Endpoints

- `POST /mcp` - Main MCP endpoint for JSON-RPC messages (configurable via `--path`)
- `GET /mcp` - SSE stream endpoint for server-initiated messages (configurable via `--path`)
- `GET /health` - Health check endpoint (returns status and connection count)

### Health Check Response

```json
{
  "status": "healthy",
  "mode": "http",
  "sessions": 0,
  "upstreamEndpoint": "http://localhost:8080/mcp"
}
```

## Connecting Clients

### Using MCP SDK

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

const transport = new StreamableHTTPClientTransport({
  url: 'http://localhost:3000/mcp'
});

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

### Manual HTTP Requests

```bash
# Send an initialize request
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

## Error Handling

The proxy handles various error scenarios:
- Connection failures to the upstream server
- Invalid or missing `MCP-Protocol-Version` header
- Invalid JSON-RPC messages
- Stream errors
- Invalid session IDs
- CORS violations

All errors are logged to the console and appropriate error responses are sent back to the client.

## Security

- **Localhost Binding**: By default, the server binds to `127.0.0.1` to prevent external access
- **CORS Protection**: Validates `Origin` header to prevent DNS rebinding attacks
- **Protocol Validation**: Requires `MCP-Protocol-Version` header on all requests
- **Session Validation**: Validates session IDs when provided

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run built version
npm start
```

## Troubleshooting

- Check console logs for detailed request/response information
- Verify your upstream MCP server is running and accessible
- Ensure the `MCP-Protocol-Version` header is included in requests
- Use the health endpoint to check proxy status
- Enable DEBUG logging: `LOG_LEVELS=CONNECTION,REQUEST,FORWARD,RESPONSE,DEBUG npm run dev`

## Specification Compliance

This proxy implements the MCP Streamable HTTP transport specification version 2025-06-18:
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

## License

ISC
