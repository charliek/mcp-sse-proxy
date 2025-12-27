import { Request, Response } from 'express';
import axios from 'axios';
import { ProxyStrategy, ProxyConfig } from './ProxyStrategy.js';

/**
 * HttpTransportStrategy implements MCP Streamable HTTP transport
 * for proxying HTTP -> HTTP requests following the MCP specification.
 *
 * Specification: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */
export class HttpTransportStrategy implements ProxyStrategy {
  name = 'http';
  private config!: ProxyConfig;
  private readonly MCP_PROTOCOL_VERSION = '2025-06-18';

  configure(config: ProxyConfig): void {
    this.config = config;
  }

  /**
   * Handle incoming HTTP POST requests from clients
   * According to MCP spec:
   * - Body contains a single JSON-RPC request, notification, or response
   * - Server responds with either:
   *   - HTTP 202 Accepted (for responses/notifications)
   *   - SSE stream (Content-Type: text/event-stream) for requests
   *   - Single JSON response (Content-Type: application/json) for requests
   */
  async handlePost(req: Request, res: Response, sessionId?: string): Promise<void> {
    try {
      const message = req.body;
      const { method, id } = message;

      this.config.logger.request(
        `Received ${id !== undefined ? 'request' : 'notification'}: ${method || 'response'}${id !== undefined ? ` (id: ${id})` : ''}`,
        message
      );

      // Forward to upstream MCP server
      this.config.logger.forward(`Forwarding to upstream server`, message);

      const response = await axios.post(this.config.endpoint, message, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'MCP-Protocol-Version': this.MCP_PROTOCOL_VERSION,
          ...(sessionId && { 'Mcp-Session-Id': sessionId })
        },
        responseType: 'stream',
        timeout: 30000, // 30 second timeout
        validateStatus: (status) => status >= 200 && status < 500
      });

      const contentType = response.headers['content-type'];
      const mcpSessionId = response.headers['mcp-session-id'];

      // Handle session ID from upstream
      if (mcpSessionId) {
        res.setHeader('Mcp-Session-Id', mcpSessionId);
      }

      // If upstream returns SSE stream, forward it
      if (contentType?.includes('text/event-stream')) {
        this.config.logger.response(`Upstream returned SSE stream`);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        response.data.on('data', (chunk: Buffer) => {
          res.write(chunk);

          // Log SSE events
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                this.config.logger.response(`SSE event from upstream`, data);
              } catch (e) {
                // Ignore parse errors for non-JSON data
              }
            }
          }
        });

        response.data.on('end', () => {
          res.end();
          this.config.logger.debug(`SSE stream ended`);
        });

        response.data.on('error', (error: Error) => {
          this.config.logger.error(`SSE stream error`, error);
          res.end();
        });
      }
      // If upstream returns JSON, forward it
      else if (contentType?.includes('application/json')) {
        const chunks: Buffer[] = [];

        response.data.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.data.on('end', () => {
          const data = Buffer.concat(chunks).toString();
          try {
            const jsonResponse = JSON.parse(data);
            this.config.logger.response(`Upstream returned JSON`, jsonResponse);
            res.json(jsonResponse);
          } catch (error) {
            this.config.logger.error(`Failed to parse JSON response`, error);
            res.status(500).json({
              jsonrpc: '2.0',
              id: id,
              error: {
                code: -32603,
                message: 'Failed to parse upstream response'
              }
            });
          }
        });

        response.data.on('error', (error: Error) => {
          this.config.logger.error(`Response stream error`, error);
          res.status(500).json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -32603,
              message: error.message
            }
          });
        });
      }
      // For 202 Accepted or other responses
      else {
        this.config.logger.response(`Upstream returned status ${response.status}`);
        res.status(response.status).send();
      }

    } catch (error: any) {
      this.config.logger.error(`Error handling POST request`, {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      });

      // Return JSON-RPC error (without stack trace for security)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: error.message || 'Internal error'
          }
        });
      }
    }
  }

  /**
   * Handle incoming HTTP GET requests from clients
   * According to MCP spec:
   * - Opens an SSE stream for server-initiated messages
   * - Client must include Accept: text/event-stream
   */
  async handleGet(req: Request, res: Response, sessionId?: string): Promise<void> {
    try {
      this.config.logger.connection(`Opening SSE stream for server-initiated messages`);

      // Forward GET request to upstream server
      // Note: No timeout for SSE streams - they are long-lived connections
      const response = await axios.get(this.config.endpoint, {
        headers: {
          'Accept': 'text/event-stream',
          'MCP-Protocol-Version': this.MCP_PROTOCOL_VERSION,
          ...(sessionId && { 'Mcp-Session-Id': sessionId })
        },
        responseType: 'stream',
        timeout: 0, // No timeout for long-lived SSE streams
        validateStatus: (status) => status >= 200 && status < 500
      });

      if (response.status === 405) {
        this.config.logger.debug(`Upstream does not support GET (405 Method Not Allowed)`);
        res.status(405).send('Method Not Allowed');
        return;
      }

      const mcpSessionId = response.headers['mcp-session-id'];
      if (mcpSessionId) {
        res.setHeader('Mcp-Session-Id', mcpSessionId);
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      response.data.on('data', (chunk: Buffer) => {
        res.write(chunk);

        // Log SSE events
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              this.config.logger.response(`Server-initiated message from upstream`, data);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      response.data.on('end', () => {
        res.end();
        this.config.logger.connection(`SSE stream closed`);
      });

      response.data.on('error', (error: Error) => {
        this.config.logger.error(`SSE stream error`, error);
        res.end();
      });

      // Handle client disconnect
      req.on('close', () => {
        this.config.logger.connection(`Client disconnected from SSE stream`);
        response.data.destroy();
      });

    } catch (error: any) {
      this.config.logger.error(`Error handling GET request`, {
        message: error.message,
        stack: error.stack
      });

      if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
      }
    }
  }

  /**
   * This method is not used for HTTP transport
   * Keeping for interface compatibility
   */
  async handleMessage(sessionId: string, request: any, response: Response): Promise<void> {
    // Not used for HTTP transport
    throw new Error('handleMessage not implemented for HTTP transport - use handlePost instead');
  }
}
