import { Response } from 'express';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ProxyStrategy, ProxyConfig } from './ProxyStrategy.js';
import { z } from 'zod';
import { NotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { EventSource as EventSourcePolyfill } from 'eventsource';

// Set up EventSource globally
(global as any).EventSource = EventSourcePolyfill;

export class SSEToSSEStrategy implements ProxyStrategy {
  name = 'sse';
  private config!: ProxyConfig;
  private upstreamClients = new Map<string, Client>();

  configure(config: ProxyConfig): void {
    this.config = config;
  }

  async handleConnection(sessionId: string, sseResponse: Response): Promise<void> {
    try {
      // Create upstream SSE client
      const transport = new SSEClientTransport(new URL(this.config.endpoint));
      const client = new Client(
        {
          name: `proxy-client-${sessionId}`,
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Store the client for this session
      this.upstreamClients.set(sessionId, client);

      this.config.logger.forward(`Connecting to upstream SSE server: ${this.config.endpoint}`);

      // Connect to upstream server
      await client.connect(transport);

      this.config.logger.connection(`Connected to upstream SSE server for session ${sessionId}`);

      // Set up notification handler from upstream
      // We need to use the fallback handler since we want to handle all notifications
      client.fallbackNotificationHandler = async (notification) => {
        const message = {
          jsonrpc: '2.0',
          method: notification.method,
          params: notification.params
        };
        this.config.logger.response(`Received notification from upstream`, message);
        sseResponse.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
        this.config.logger.sse(`Forwarded notification to client`, message);
      };

      // Note: MCP SDK client doesn't handle incoming requests from server
      // This is a limitation - SSE-to-SSE proxy can only forward client->server not server->client requests

    } catch (error: any) {
      this.config.logger.error(`Failed to connect to upstream SSE server for session ${sessionId}`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        endpoint: this.config.endpoint
      });
      throw error;
    }
  }

  async handleMessage(sessionId: string, request: any, sseResponse: Response): Promise<void> {
    const client = this.upstreamClients.get(sessionId);
    
    if (!client) {
      this.config.logger.error(`No upstream client found for session: ${sessionId}`);
      const errorResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'No upstream connection found'
        }
      };
      sseResponse.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
      return;
    }

    try {
      const { method, params, id } = request;
      this.config.logger.request(`Forwarding to upstream: ${method} (id: ${id})`, request);

      if (id !== undefined) {
        // It's a request that expects a response  
        // Use a generic result schema that accepts any response
        const resultSchema = z.object({}).passthrough();
        const response = await client.request({ method, params }, resultSchema);
        const jsonRpcResponse = {
          jsonrpc: '2.0',
          id,
          result: response
        };
        this.config.logger.response(`Received response from upstream`, jsonRpcResponse);
        sseResponse.write(`event: message\ndata: ${JSON.stringify(jsonRpcResponse)}\n\n`);
        this.config.logger.sse(`Sent response to client`, jsonRpcResponse);
      } else {
        // It's a notification
        await client.notification({ method, params });
        this.config.logger.forward(`Sent notification to upstream: ${method}`);
      }
    } catch (error: any) {
      this.config.logger.error(`Error forwarding to upstream`, error);
      
      const errorResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error',
          data: error.stack
        }
      };
      
      sseResponse.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
    }
  }

  async shutdown(): Promise<void> {
    for (const [sessionId, client] of this.upstreamClients.entries()) {
      try {
        await client.close();
        this.config.logger.system(`Closed upstream connection for session ${sessionId}`);
      } catch (error) {
        this.config.logger.error(`Error closing upstream connection for session ${sessionId}`, error);
      }
    }
    this.upstreamClients.clear();
  }
}