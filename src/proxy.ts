import express, { Request, Response } from 'express';
import cors from 'cors';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import axios from 'axios';

// Configuration
const STREAMABLE_HTTP_ENDPOINT = "http://localhost:8080/mcp";
const SSE_PORT = 3000;
const SSE_ENDPOINT = "/sse";

// Create Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Store active SSE connections and their associated axios instances
interface ConnectionInfo {
  response: Response;
  sessionId: string;
}

const connections = new Map<string, ConnectionInfo>();

// Helper function to make HTTP requests to the streamable endpoint
async function sendToStreamableEndpoint(method: string, params: any, id: string | number): Promise<NodeJS.ReadableStream> {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id
  };

  const response = await axios.post(STREAMABLE_HTTP_ENDPOINT, request, {
    headers: {
      'Content-Type': 'application/json'
    },
    responseType: 'stream'
  });

  return response.data as NodeJS.ReadableStream;
}

async function main() {
  try {
    console.log(`Starting MCP proxy on port ${SSE_PORT}`);
    console.log(`SSE endpoint: http://localhost:${SSE_PORT}${SSE_ENDPOINT}`);
    console.log(`Forwarding to Streamable HTTP: ${STREAMABLE_HTTP_ENDPOINT}`);

    // SSE endpoint for MCP clients to connect to
    app.get(SSE_ENDPOINT, async (req: Request, res: Response) => {
      const sessionId = Date.now().toString();
      console.log(`New SSE connection initiated: ${sessionId}`);
      
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      });
      
      try {
        // Store the connection
        const connectionInfo: ConnectionInfo = {
          response: res,
          sessionId
        };
        connections.set(sessionId, connectionInfo);
        
        // Send initial endpoint event (MCP SSE protocol)
        // The endpoint event tells the client where to send messages
        // Send just the path component - client should append this to the SSE URL
        const endpoint = `messages/${sessionId}`;
        res.write(`event: endpoint\ndata: ${endpoint}\n\n`);
        
        console.log(`Client ${sessionId} connected, endpoint: ${endpoint}`);
        
        // Keep the connection alive
        const heartbeatInterval = setInterval(() => {
          if (res.socket?.destroyed) {
            clearInterval(heartbeatInterval);
          } else {
            res.write(':ping\n\n');
          }
        }, 30000); // Send heartbeat every 30 seconds
        
        // Handle client disconnect
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          connections.delete(sessionId);
          console.log(`Client ${sessionId} disconnected`);
        });
      } catch (error) {
        console.error(`Failed to setup SSE connection for ${sessionId}:`, error);
        res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to setup connection' })}\n\n`);
        res.end();
        return;
      }
    });

    // Endpoint for receiving messages from SSE client
    app.post('/messages/:sessionId', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const connection = connections.get(sessionId);
      
      if (!connection) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      try {
        const { jsonrpc, method, params, id } = req.body;
        
        console.log(`Received message from client ${sessionId}:`, { method, id });
        
        // Forward the request to the streamable endpoint
        const streamResponse = await sendToStreamableEndpoint(method, params, id);
        
        // Process the streaming response
        streamResponse.on('data', (chunk: Buffer) => {
          try {
            // The streamable endpoint might send multiple JSON-RPC responses
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const response = JSON.parse(line);
                
                // Send the response back through the SSE connection
                connection.response.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
              } catch (parseError) {
                // If line is not valid JSON, skip it
                console.warn(`Invalid JSON in stream response: ${line}`);
              }
            }
          } catch (error) {
            console.error(`Error processing stream chunk:`, error);
          }
        });
        
        streamResponse.on('end', () => {
          console.log(`Stream ended for request ${id}`);
        });
        
        streamResponse.on('error', (error: Error) => {
          console.error(`Stream error for request ${id}:`, error);
          
          // Send error response through SSE
          const errorResponse = {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: error.message || 'Internal error',
              data: error.stack
            }
          };
          
          connection.response.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
        });
        
        // Respond to the POST request with empty 202 as per MCP SSE spec
        res.status(202).send();
      } catch (error: any) {
        console.error(`Error forwarding request from ${sessionId}:`, error);
        
        // Send error response through SSE
        const errorResponse = {
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: error.message || 'Internal error',
            data: error.stack
          }
        };
        
        connection.response.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
        res.status(202).send();
      }
    });

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', connections: connections.size });
    });

    // Start the server
    app.listen(SSE_PORT, '0.0.0.0', () => {
      console.log(`Proxy server running on http://0.0.0.0:${SSE_PORT}`);
      console.log(`SSE endpoint: http://0.0.0.0:${SSE_PORT}${SSE_ENDPOINT}`);
    });
    
    // Handle shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down proxy...");
      process.exit(0);
    });
  } catch (error) {
    console.error("Error starting proxy:", error);
    process.exit(1);
  }
}

main().catch(console.error);