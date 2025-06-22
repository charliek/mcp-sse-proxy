# MCP SSE Proxy

A flexible bidirectional proxy server that can translate between different MCP (Model Context Protocol) transport types. Supports all combinations of:
- SSE input → Streamable HTTP output
- SSE input → SSE output
- Streamable HTTP input → Streamable HTTP output
- Streamable HTTP input → SSE output

## Features

- Bidirectional proxy supporting both SSE and streamable HTTP as input and output
- All four transport combinations supported
- Comprehensive logging with configurable levels and colors
- Optional HTTP pass-through for non-MCP routes
- Session management for concurrent connections
- Heartbeat support for SSE connections
- Error handling and graceful shutdown

## Prerequisites

- Node.js 18+
- npm
- A running MCP server (either streamable HTTP or SSE based)

## Installation

```bash
npm install
```

## Usage

### Quick Start

```bash
# Development (default: SSE input → Streamable HTTP output)
npm run dev

# Production
npm run build
npm start
```

### Specific Transport Combinations

```bash
# SSE input → Streamable HTTP output
npm run dev:sse-to-http

# SSE input → SSE output
npm run dev:sse-to-sse

# Streamable HTTP input → Streamable HTTP output
npm run dev:http-to-http

# Streamable HTTP input → SSE output
npm run dev:http-to-sse
```

### Command-line Options

```bash
# General usage
node dist/proxy.js [options]

Options:
  --input-mode     Input mode: how clients connect to proxy
                   [choices: "streamable", "sse"] [default: "sse"]
  --output-mode    Output mode: how proxy connects to upstream
                   [choices: "streamable", "sse"] [default: "streamable"]
  --port           Port to listen on [number] [default: 3000]
  --endpoint       Upstream endpoint URL [string]
                   Default: http://localhost:8080/mcp (streamable output)
                           http://localhost:8080/sse (sse output)
  --sse-endpoint       SSE endpoint path [string] [default: "/sse"]
  --http-endpoint      HTTP endpoint path for streamable input [string] [default: "/mcp"]
  --enable-passthrough Enable HTTP pass-through for non-MCP routes [boolean] [default: false]
  --help               Show help [boolean]

Examples:
  # SSE input to HTTP output on custom port
  node dist/proxy.js --input-mode sse --output-mode streamable --port 3500 --endpoint http://localhost:9000/mcp

  # HTTP input to SSE output
  node dist/proxy.js --input-mode streamable --output-mode sse --endpoint http://another-server.com/sse

  # Full HTTP proxy
  node dist/proxy.js --input-mode streamable --output-mode streamable
  
  # Enable pass-through for additional routes
  node dist/proxy.js --enable-passthrough --endpoint http://localhost:8080/mcp
```

## Configuration

### Logging Configuration

The proxy uses a flexible logging system that can be configured via `logging.config.json` or environment variables.

**Default logging.config.json:**
```json
{
  "levels": {
    "CONNECTION": { "enabled": true, "color": "green", "showPayload": true },
    "REQUEST": { "enabled": true, "color": "cyan", "showPayload": true },
    "FORWARD": { "enabled": true, "color": "yellow", "showPayload": true },
    "RESPONSE": { "enabled": true, "color": "magenta", "showPayload": true },
    "SSE": { "enabled": true, "color": "blue", "showPayload": false },
    "HTTP": { "enabled": true, "color": "whiteBright", "showPayload": true },
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

The proxy supports four transport combinations:

### 1. SSE Input → Streamable HTTP Output
1. SSE clients connect to `/sse` endpoint
2. Server creates a session and sends an `endpoint` event with path
3. Clients POST JSON-RPC messages to `/messages/{sessionId}`
4. Proxy forwards requests to streamable HTTP MCP server
5. Streaming responses are sent back through SSE connection

### 2. SSE Input → SSE Output
1. SSE clients connect to `/sse` endpoint
2. Server creates a session and upstream SSE connection
3. Messages are relayed bidirectionally between client and upstream
4. Connection lifecycle is managed for both sides

### 3. Streamable HTTP Input → Streamable HTTP Output
1. HTTP clients POST to `/mcp` endpoint
2. Server forwards the request to upstream HTTP server
3. Streaming response is relayed back to client
4. Connection is closed after response completes

### 4. Streamable HTTP Input → SSE Output
1. HTTP clients POST to `/mcp` endpoint
2. Server creates upstream SSE connection
3. Request is forwarded through SSE
4. Response is streamed back via HTTP

```
[Client] <--SSE or HTTP--> [This Proxy] <--SSE or HTTP--> [MCP Server]
```

The proxy handles:
- Both SSE and HTTP connection management
- Session tracking (persistent for SSE, ephemeral for HTTP)
- Request/response forwarding with appropriate format conversion
- Error handling across all transport types
- Connection heartbeats for SSE
- Optional HTTP pass-through for non-MCP routes to upstream server

## API Endpoints

### When Input Mode is SSE:
- `GET /sse` - SSE connection endpoint
- `POST /messages/:sessionId` - Message forwarding endpoint

### When Input Mode is Streamable HTTP:
- `POST /mcp` - Streamable HTTP endpoint

### Always Available:
- `GET /health` - Health check endpoint (returns status, input/output modes, and session count)

### When Pass-through is Enabled:
- Any other route - Proxied directly to the upstream server origin

## Connecting Clients

### For SSE Clients (e.g., Claude.ai):

1. Start your MCP server
2. Start the proxy with SSE input mode:
   ```bash
   npm run dev:sse-to-http  # For HTTP upstream
   npm run dev:sse-to-sse   # For SSE upstream
   ```
3. Connect to: `http://localhost:3000/sse`
4. When connected, you'll receive an `endpoint` event with the URL to send messages to
5. POST JSON-RPC messages to the provided endpoint

### For Streamable HTTP Clients:

1. Start your MCP server
2. Start the proxy with HTTP input mode:
   ```bash
   npm run dev:http-to-http  # For HTTP upstream
   npm run dev:http-to-sse   # For SSE upstream
   ```
3. POST JSON-RPC messages directly to: `http://localhost:3000/mcp`
4. Responses will be streamed back in the HTTP response

## Error Handling

The proxy handles various error scenarios:
- Connection failures to the upstream server
- Invalid JSON-RPC messages
- Stream errors
- Client disconnections
- Session not found errors

All errors are logged to the console and appropriate error responses are sent back to the client.

## Development

```bash
# Install dependencies
npm install

# Run in development mode (default: SSE → HTTP)
npm run dev

# Run specific transport combinations
npm run dev:sse-to-http    # SSE → HTTP
npm run dev:sse-to-sse     # SSE → SSE
npm run dev:http-to-http   # HTTP → HTTP
npm run dev:http-to-sse    # HTTP → SSE

# Build TypeScript
npm run build

# Run built version with specific modes
npm run start:sse-to-http  # SSE → HTTP
npm run start:http-to-sse  # HTTP → SSE
# etc.
```

## Troubleshooting

- Check console logs for detailed connection and message information
- Verify your MCP server is running and accessible
- Ensure proper firewall/network access if running on different machines
- Check that the SSE client is sending valid JSON-RPC requests
- Use the health endpoint to check status and connection count

## License

ISC