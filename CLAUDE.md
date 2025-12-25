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

This is a proxy server that implements the MCP (Model Context Protocol) Streamable HTTP transport specification (version 2025-06-18) to forward requests between MCP clients and servers.

### Core Flow
1. MCP clients send HTTP POST requests to `/mcp` endpoint with JSON-RPC messages
2. Proxy validates `MCP-Protocol-Version` header
3. Proxy forwards the request to the upstream MCP server
4. Responses are returned either as:
   - HTTP 202 Accepted (for notifications/responses)
   - SSE stream (text/event-stream) for streaming responses
   - JSON response (application/json) for single responses
5. MCP clients can also send HTTP GET requests to `/mcp` to open SSE streams for server-initiated messages

### Key Components
- **Express Server**: Handles HTTP POST and GET requests following MCP specification
- **Session Management**: Optional session tracking via `Mcp-Session-Id` header
- **Stream Forwarding**: Uses Axios to forward requests and handle streaming responses
- **HttpTransportStrategy**: Implements the MCP Streamable HTTP transport logic
- **Logger**: Configurable logging system with categories and payload display

### Configuration Points
All configuration is via command-line arguments:
- `--endpoint`: Upstream MCP server URL (default: "http://localhost:8080/mcp")
- `--port`: Port to listen on (default: 3000)
- `--path`: HTTP endpoint path for MCP requests (default: "/mcp")

### Important Routes
- `POST /mcp` - Main MCP endpoint for JSON-RPC messages
- `GET /mcp` - SSE stream endpoint for server-initiated messages
- `GET /health` - Health check endpoint

## Development Notes

### Running the Proxy
1. Ensure your upstream MCP server is running at `http://localhost:8080/mcp` (or specify with `--endpoint`)
2. Run `npm run dev` for development
3. Server will listen on `http://127.0.0.1:3000` (localhost only for security)

### MCP Protocol Requirements
- All requests must include `MCP-Protocol-Version: 2025-06-18` header
- POST requests must include `Accept: application/json, text/event-stream` header
- GET requests must include `Accept: text/event-stream` header
- Optional `Mcp-Session-Id` header for stateful sessions

### Security
- Server binds to 127.0.0.1 (localhost) by default
- CORS validation prevents DNS rebinding attacks
- Only accepts requests from localhost origins

### Error Handling
- Connection failures are logged and appropriate error responses sent
- Stream errors are caught and forwarded to clients
- Invalid sessions return 404 errors
- Missing protocol version returns 400 errors
- All errors include detailed logging

### File Structure
- `src/proxy.ts` - Main server implementation
- `src/strategies/HttpTransportStrategy.ts` - MCP HTTP transport implementation
- `src/strategies/ProxyStrategy.ts` - Strategy interface
- `src/logger.ts` - Logging system

## Specification Compliance

This proxy follows the MCP Streamable HTTP transport specification:
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports

Key features:
- Single HTTP endpoint supporting both POST and GET methods
- Protocol version validation
- Session management via headers
- SSE streaming support for both request responses and server-initiated messages
