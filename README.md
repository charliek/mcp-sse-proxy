# MCP SSE Proxy

A flexible proxy server that can translate between different MCP (Model Context Protocol) transport types:
- SSE to Streamable HTTP (default)
- SSE to SSE

## Features

- Support for two proxy modes: streamable HTTP and SSE-to-SSE
- Comprehensive logging with configurable levels and colors
- Session management for concurrent connections
- Heartbeat support for connection maintenance
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

### Default Mode (SSE to Streamable HTTP)

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### SSE to SSE Mode

```bash
# Development
npm run dev:sse

# Production
npm run build
npm run start:sse
```

### Command-line Options

```bash
# General usage
node dist/proxy.js [options]

Options:
  --mode          Proxy mode: streamable (HTTP) or sse (SSE-to-SSE)
                  [choices: "streamable", "sse"] [default: "streamable"]
  --port          Port to listen on [number] [default: 3000]
  --endpoint      Upstream endpoint URL [string]
                  Default: http://localhost:8080/mcp (streamable)
                          http://localhost:3001/sse (sse)
  --sse-endpoint  SSE endpoint path [string] [default: "/sse"]
  --help          Show help [boolean]

Examples:
  # SSE to HTTP proxy on custom port
  node dist/proxy.js --mode streamable --port 3500 --endpoint http://localhost:9000/mcp

  # SSE to SSE proxy
  node dist/proxy.js --mode sse --endpoint http://another-server.com/sse
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

### Streamable Mode (SSE → HTTP)
1. SSE clients connect to `/sse` endpoint
2. Server creates a session and sends an `endpoint` event with path
3. Clients POST JSON-RPC messages to `/messages/{sessionId}`
4. Proxy forwards requests to streamable HTTP MCP server
5. Streaming responses are sent back through SSE connection

### SSE Mode (SSE → SSE)
1. SSE clients connect to `/sse` endpoint
2. Server creates a session and upstream SSE connection
3. Messages are relayed bidirectionally between client and upstream
4. Connection lifecycle is managed for both sides

```
[SSE Client] <--SSE--> [This Proxy] <--HTTP Stream or SSE--> [MCP Server]
```

The proxy handles:
- SSE connection management
- Session tracking
- Request/response forwarding
- Error handling
- Connection heartbeats

## API Endpoints

- `GET /sse` - SSE connection endpoint
- `POST /messages/:sessionId` - Message forwarding endpoint
- `GET /health` - Health check endpoint (returns status, mode, and connection count)

## Connecting Clients

After starting the proxy, you can connect MCP SSE clients to it:

1. The SSE endpoint will be available at: `http://localhost:3000/sse`
2. When a client connects, they'll receive an `endpoint` event with the URL to send messages to
3. The client should then POST JSON-RPC messages to the provided endpoint

### Example with Claude.ai

1. Start your MCP server (either streamable HTTP or SSE)
2. Start this proxy server in the appropriate mode
3. In Claude.ai, go to integrations
4. Add the SSE endpoint URL: `http://localhost:3000/sse`

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

# Run in development mode (default: streamable)
npm run dev

# Run in SSE mode
npm run dev:sse

# Build TypeScript
npm run build

# Run built version
npm start
```

## Troubleshooting

- Check console logs for detailed connection and message information
- Verify your MCP server is running and accessible
- Ensure proper firewall/network access if running on different machines
- Check that the SSE client is sending valid JSON-RPC requests
- Use the health endpoint to check status and connection count

## License

ISC