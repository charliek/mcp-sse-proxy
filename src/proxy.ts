import express, { Request, Response } from 'express';
import cors from 'cors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { logger, LogCategory } from './logger.js';
import axios from 'axios';
import { ProxyStrategy, ProxyConfig } from './strategies/ProxyStrategy.js';
import { StreamableHttpStrategy } from './strategies/StreamableHttpStrategy.js';
import { SSEToSSEStrategy } from './strategies/SSEToSSEStrategy.js';

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('mode', {
    type: 'string',
    choices: ['streamable', 'sse'],
    default: 'streamable',
    description: 'Proxy mode: streamable (HTTP) or sse (SSE-to-SSE)'
  })
  .option('port', {
    type: 'number',
    default: 3000,
    description: 'Port to listen on'
  })
  .option('endpoint', {
    type: 'string',
    description: 'Upstream endpoint URL'
  })
  .option('sse-endpoint', {
    type: 'string',
    default: '/sse',
    description: 'SSE endpoint path'
  })
  .help()
  .argv as any;

// Default endpoints based on mode
const DEFAULT_ENDPOINTS: Record<string, string> = {
  streamable: 'http://localhost:8080/mcp',
  sse: 'http://localhost:8080/mcp'
};

const endpoint = argv.endpoint || DEFAULT_ENDPOINTS[argv.mode];
const port = argv.port;
const sseEndpoint = argv.sseEndpoint;
const upstreamOrigin = new URL(endpoint).origin;

// Create Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Store active SSE connections and their associated info
interface ConnectionInfo {
  response: Response;
  sessionId: string;
  strategy: ProxyStrategy;
}

const connections = new Map<string, ConnectionInfo>();

// Select strategy based on mode
function createStrategy(mode: string): ProxyStrategy {
  switch (mode) {
    case 'sse':
      return new SSEToSSEStrategy();
    case 'streamable':
    default:
      return new StreamableHttpStrategy();
  }
}

async function main() {
  try {
    logger.system(`Starting MCP proxy in ${argv.mode} mode on port ${port}`);
    logger.system(`SSE endpoint: http://localhost:${port}${sseEndpoint}`);
    logger.system(`Upstream endpoint: ${endpoint}`);

    // Create strategy instance
    const strategy = createStrategy(argv.mode);
    const config: ProxyConfig = {
      endpoint,
      port,
      sseEndpoint,
      logger
    };
    strategy.configure(config);

    // SSE endpoint for MCP clients to connect to
    app.get(sseEndpoint, async (req: Request, res: Response) => {
      const sessionId = Date.now().toString();
      logger.connection(`New SSE connection initiated: ${sessionId}`);
      
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
          sessionId,
          strategy
        };
        connections.set(sessionId, connectionInfo);
        
        // Send initial endpoint event (MCP SSE protocol)
        const endpointPath = `messages/${sessionId}`;
        const endpointEvent = `event: endpoint\ndata: ${endpointPath}\n\n`;
        res.write(endpointEvent);
        
        logger.connection(`Client ${sessionId} connected`);
        logger.sse(`Sent SSE endpoint event`, { event: 'endpoint', data: endpointPath });
        
        // Let the strategy handle the connection if needed
        if (strategy.handleConnection) {
          await strategy.handleConnection(sessionId, res);
        }
        
        // Keep the connection alive
        const heartbeatInterval = setInterval(() => {
          if (res.socket?.destroyed) {
            clearInterval(heartbeatInterval);
          } else {
            res.write(':ping\n\n');
            logger.debug(`Sent heartbeat to ${sessionId}`);
          }
        }, 30000); // Send heartbeat every 30 seconds
        
        // Handle client disconnect
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          connections.delete(sessionId);
          logger.connection(`Client ${sessionId} disconnected`);
        });
      } catch (error: any) {
        logger.error(`Failed to setup SSE connection for ${sessionId}`, {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'Failed to setup connection' })}\n\n`);
        res.end();
        return;
      }
    });

    // Endpoint for receiving messages from SSE client
    app.post('/messages/:sessionId', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const connection = connections.get(sessionId);
      
      if (!connection) {
        logger.error(`Session not found: ${sessionId}`);
        return res.status(404).json({ error: 'Session not found' });
      }
      
      try {
        // Let the strategy handle the message
        await connection.strategy.handleMessage(sessionId, req.body, connection.response);
        
        // Respond to the POST request with empty 202 as per MCP SSE spec
        res.status(202).send();
      } catch (error) {
        logger.error(`Error handling message from ${sessionId}`, error);
        res.status(202).send();
      }
    });

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
      const status = {
        status: 'healthy',
        mode: argv.mode,
        connections: connections.size
      };
      logger.debug('Health check requested', status);
      res.json(status);
    });

    // Proxy any other HTTP requests directly to the upstream origin
    app.use(async (req: Request, res: Response) => {
      const targetUrl = new URL(req.originalUrl, upstreamOrigin).toString();
      try {
        logger.http(`Proxying ${req.method} ${req.originalUrl} -> ${targetUrl}`, req.body);

        const response = await axios.request({
          url: targetUrl,
          method: req.method as any,
          headers: { ...req.headers, host: new URL(upstreamOrigin).host },
          data: req.body,
          responseType: 'stream',
          validateStatus: () => true
        });

        res.status(response.status);
        for (const [key, value] of Object.entries(response.headers)) {
          res.setHeader(key, value as any);
        }

        response.data.pipe(res);
      } catch (error: any) {
        logger.error(`Error proxying request to ${targetUrl}`, error);
        res.status(502).json({ error: 'Proxy error' });
      }
    });

    // Start the server
    app.listen(port, '0.0.0.0', () => {
      logger.system(`Proxy server running on http://0.0.0.0:${port}`);
      logger.system(`SSE endpoint: http://0.0.0.0:${port}${sseEndpoint}`);
      logger.system(`Mode: ${argv.mode}`);
    });
    
    // Handle shutdown
    process.on("SIGINT", async () => {
      logger.system("Shutting down proxy...");
      
      // Let strategies clean up
      const strategies = new Set([...connections.values()].map(c => c.strategy));
      for (const s of strategies) {
        if (s.shutdown) {
          await s.shutdown();
        }
      }
      
      process.exit(0);
    });
  } catch (error) {
    logger.error("Error starting proxy", error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error", error);
});