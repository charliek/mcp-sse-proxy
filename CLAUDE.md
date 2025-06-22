# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- `npm run dev` - Run the proxy server with default modes (SSE → HTTP)
- `npm run dev:sse-to-http` - SSE input → Streamable HTTP output
- `npm run dev:sse-to-sse` - SSE input → SSE output
- `npm run dev:http-to-http` - Streamable HTTP input → Streamable HTTP output
- `npm run dev:http-to-sse` - Streamable HTTP input → SSE output
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled proxy server in production mode
- `npm test` - Not implemented yet

### No Linting or Formatting Commands
This project currently lacks linting and formatting configuration.

## Architecture Overview

This is a bidirectional proxy server that translates between MCP (Model Context Protocol) transport types. It supports both SSE (Server-Sent Events) and streamable HTTP as input and output transports, enabling all four possible combinations.

### Core Flows

#### SSE Input
1. SSE clients connect to `/sse` endpoint
2. Server creates a session and sends an `endpoint` event with the path `messages/{sessionId}`
3. Clients POST JSON-RPC messages to `/messages/{sessionId}`
4. Proxy forwards requests to the upstream server (HTTP or SSE)
5. Responses are sent back through the SSE connection

#### Streamable HTTP Input
1. HTTP clients POST to `/mcp` endpoint
2. Server creates an ephemeral session
3. Request is forwarded to the upstream server (HTTP or SSE)
4. Streaming response is sent back in the HTTP response

### Key Components
- **Express Server**: Handles both SSE and HTTP connections
- **Input Strategies**: `SSEInputStrategy` and `StreamableHttpInputStrategy` handle incoming connections
- **Output Strategies**: `SSEOutputStrategy` and `StreamableHttpOutputStrategy` handle upstream connections
- **Session Management**: Maps session IDs to connection information (persistent for SSE, ephemeral for HTTP)
- **Connection Lifecycle**: Includes heartbeats for SSE, disconnection handling, and graceful shutdown

### Configuration Points
Configuration via command-line arguments:
- `--input-mode`: "sse" or "streamable" (default: "sse")
- `--output-mode`: "sse" or "streamable" (default: "streamable")
- `--port`: Server port (default: 3000)
- `--endpoint`: Upstream endpoint URL
- `--sse-endpoint`: SSE input path (default: "/sse")
- `--http-endpoint`: HTTP input path (default: "/mcp")

### Important Routes
- `GET /sse` - SSE connection endpoint (when input mode is SSE)
- `POST /messages/:sessionId` - Message forwarding endpoint (when input mode is SSE)
- `POST /mcp` - Streamable HTTP endpoint (when input mode is streamable)
- `GET /health` - Health check endpoint (always available)

## Development Notes

### Running the Proxy
1. Ensure your MCP server is running at the appropriate endpoint
2. Choose the appropriate transport combination:
   - `npm run dev:sse-to-http` - SSE input → HTTP output
   - `npm run dev:sse-to-sse` - SSE input → SSE output
   - `npm run dev:http-to-http` - HTTP input → HTTP output
   - `npm run dev:http-to-sse` - HTTP input → SSE output
3. Server will listen on `http://localhost:3000`

### Claude.ai Integration
When setting up with Claude.ai (which uses SSE):
- Ensure the proxy is running with SSE input mode (`--input-mode sse`)
- Use the full SSE endpoint URL (e.g., `https://your-domain.com/sse`)
- The proxy handles endpoint discovery automatically
- Messages are routed through relative paths

### Error Handling
- Connection failures are logged and appropriate error responses sent
- Stream errors are caught and forwarded to clients
- Invalid sessions return 404 errors (SSE input mode)
- HTTP errors are returned directly in the response (HTTP input mode)
- All errors include stack traces in development