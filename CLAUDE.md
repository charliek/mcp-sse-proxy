# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- `npm run dev` - Run the proxy server in development mode with TypeScript (uses tsx)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled proxy server in production mode
- `npm test` - Not implemented yet

### No Linting or Formatting Commands
This project currently lacks linting and formatting configuration.

## Architecture Overview

This is a proxy server that translates between MCP (Model Context Protocol) SSE (Server-Sent Events) transport and streamable HTTP transport.

### Core Flow
1. SSE clients connect to `/sse` endpoint
2. Server creates a session and sends an `endpoint` event with the path `messages/{sessionId}`
3. Clients POST JSON-RPC messages to `/messages/{sessionId}`
4. Proxy forwards requests to the streamable HTTP MCP server at `http://localhost:8080/mcp`
5. Streaming responses are sent back to the client through the SSE connection

### Key Components
- **Express Server**: Handles SSE connections and HTTP POST requests
- **Session Management**: Maps session IDs to SSE response objects
- **Stream Forwarding**: Uses Axios to forward requests and handle streaming responses
- **Connection Lifecycle**: Includes heartbeats, disconnection handling, and graceful shutdown

### Configuration Points
All configuration is hardcoded in `src/proxy.ts`:
- `STREAMABLE_HTTP_ENDPOINT`: "http://localhost:8080/mcp"
- `SSE_PORT`: 3000
- `SSE_ENDPOINT`: "/sse"

### Important Routes
- `GET /sse` - SSE connection endpoint
- `POST /messages/:sessionId` - Message forwarding endpoint
- `GET /health` - Health check endpoint

## Development Notes

### Running the Proxy
1. Ensure your MCP server is running at `http://localhost:8080/mcp`
2. Run `npm run dev` for development
3. Server will listen on `http://localhost:3000`

### Claude.ai Integration
When setting up with Claude.ai:
- Use the full SSE endpoint URL (e.g., `https://your-domain.com/sse`)
- The proxy handles endpoint discovery automatically
- Messages are routed through relative paths

### Error Handling
- Connection failures are logged and appropriate error responses sent
- Stream errors are caught and forwarded to clients
- Invalid sessions return 404 errors
- All errors include stack traces in development