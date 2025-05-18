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

The proxy server can be configured by editing `src/proxy.ts`:

- `STREAMABLE_HTTP_ENDPOINT`: URL of your streamable HTTP MCP server (default: `http://localhost:8080/mcp`)
- `SSE_PORT`: Port for the proxy SSE server (default: `3000`)
- `SSE_ENDPOINT`: Endpoint path for the SSE server (default: `/sse`)

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