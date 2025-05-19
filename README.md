# MCP SSE to Streamable HTTP Proxy

This project provides a proxy server that translates between the MCP (Model Context Protocol) SSE (Server-Sent Events) transport and the streamable HTTP transport. It allows SSE-based MCP clients (like Claude.ai) to communicate with HTTP-based MCP servers.

## How it Works

The proxy server:
1. Exposes an SSE endpoint that MCP clients can connect to
2. Receives JSON-RPC requests from SSE clients via HTTP POST
3. Forwards these requests to a streamable HTTP MCP server
4. Streams the responses back to the SSE client

## Prerequisites

- Node.js 18+
- npm
- A running MCP server using the streamable HTTP transport

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

### Server Configuration

The proxy server can be configured by editing `src/proxy.ts`:

- `STREAMABLE_HTTP_ENDPOINT`: URL of your streamable HTTP MCP server (default: `http://localhost:8080/mcp`)
- `SSE_PORT`: Port for the proxy SSE server (default: `3000`)
- `SSE_ENDPOINT`: Endpoint path for the SSE server (default: `/sse`)

### Logging Configuration

The proxy includes a color-coded logging system that can be configured via:

1. **Configuration file** (`logging.config.json`):
```json
{
  "levels": {
    "CONNECTION": { "enabled": true, "color": "green", "showPayload": false },
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

Each category can have its own `showPayload` setting. If not specified, it falls back to the global `showPayloads` setting.

2. **Environment variables**:
   - `LOG_LEVELS`: Comma-separated list of enabled categories (e.g., `CONNECTION,REQUEST,ERROR`)
   - `LOG_COLORS`: Override colors (e.g., `CONNECTION:blue,ERROR:magenta`)
   - `LOG_PAYLOADS`: Per-category payload settings (e.g., `REQUEST:true,RESPONSE:false`)
   - `LOG_SHOW_PAYLOADS`: Set to `true` to show payloads globally (default for categories without specific settings)
   - `LOG_SHOW_TIMESTAMPS`: Set to `false` to hide timestamps
   - `LOG_CONFIG_FILE`: Path to a custom config file

### Log Categories

- **CONNECTION** (green): Client connections/disconnections
- **REQUEST** (cyan): Incoming requests from SSE clients
- **FORWARD** (yellow): Outgoing requests to MCP server
- **RESPONSE** (magenta): Responses from MCP server
- **SSE** (blue): Messages sent through SSE to clients
- **ERROR** (red): Error messages
- **DEBUG** (gray): Detailed debugging information
- **SYSTEM** (white): Server startup/shutdown messages

### Example Usage

```bash
# Show payloads only for REQUEST and FORWARD categories
LOG_PAYLOADS=REQUEST:true,FORWARD:true,RESPONSE:false npm run dev

# Enable all logs with payloads for debugging
LOG_LEVELS=CONNECTION,REQUEST,FORWARD,RESPONSE,SSE,DEBUG LOG_SHOW_PAYLOADS=true npm run dev

# Custom configuration with selective payloads
LOG_PAYLOADS=REQUEST:true,ERROR:true LOG_LEVELS=CONNECTION,REQUEST,ERROR,SYSTEM npm run dev
```

## Usage

### Development mode

Run the proxy in development mode with TypeScript:

```bash
npm run dev
```

### Production mode

Build and run in production mode:

```bash
npm run build
npm start
```

## Connecting Clients

After starting the proxy, you can connect MCP SSE clients to it:

1. The SSE endpoint will be available at: `http://localhost:3000/sse`
2. When a client connects, they'll receive an `endpoint` event with the URL to send messages to
3. The client should then POST JSON-RPC messages to the provided endpoint

### Example with Claude.ai

1. Start your streamable HTTP MCP server at `http://localhost:8080/mcp`
2. Start this proxy server
3. In Claude.ai, go to integrations
4. Add the SSE endpoint URL: `http://localhost:3000/sse`

## Architecture

```
[SSE Client] <--SSE--> [This Proxy] <--HTTP Stream--> [MCP Server]
```

The proxy handles:
- SSE connection management
- Session tracking
- Request/response forwarding
- Error handling
- Connection heartbeats

## Health Check

The proxy provides a health check endpoint at `/health` that returns:
- Server status
- Number of active connections

## Troubleshooting

- Check console logs for detailed connection and message information
- Verify your streamable HTTP MCP server is running and accessible
- Ensure proper firewall/network access if running on different machines
- Check that the SSE client is sending valid JSON-RPC requests

## Error Handling

The proxy handles various error scenarios:
- Connection failures to the MCP server
- Invalid JSON-RPC messages
- Stream errors
- Client disconnections

All errors are logged to the console and appropriate error responses are sent back to the client.