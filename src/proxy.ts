import express, { Request, Response } from 'express';
import cors from 'cors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { logger } from './logger.js';
import { ProxyConfig } from './strategies/ProxyStrategy.js';
import { HttpTransportStrategy } from './strategies/HttpTransportStrategy.js';

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('port', {
    type: 'number',
    default: 3000,
    description: 'Port to listen on'
  })
  .option('endpoint', {
    type: 'string',
    default: 'http://localhost:8080/mcp',
    description: 'Upstream MCP server endpoint URL'
  })
  .option('path', {
    type: 'string',
    default: '/mcp',
    description: 'HTTP endpoint path for MCP requests'
  })
  .help()
  .argv as any;

const port = argv.port;
const upstreamEndpoint = argv.endpoint;
const mcpPath = argv.path;

// Create Express app
const app = express();
app.use(cors({
  origin: (origin, callback) => {
    // Accept requests from localhost or same origin
    // This helps prevent DNS rebinding attacks
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
    } else {
      logger.debug(`Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Store session information if needed
interface SessionInfo {
  sessionId: string;
  createdAt: Date;
}

const sessions = new Map<string, SessionInfo>();

async function main() {
  try {
    logger.system(`Starting MCP HTTP proxy on port ${port}`);
    logger.system(`MCP endpoint: http://localhost:${port}${mcpPath}`);
    logger.system(`Upstream endpoint: ${upstreamEndpoint}`);

    // Create HTTP transport strategy
    const strategy = new HttpTransportStrategy();
    const config: ProxyConfig = {
      endpoint: upstreamEndpoint,
      port,
      sseEndpoint: mcpPath, // Reusing this field for the HTTP endpoint path
      logger
    };
    strategy.configure(config);

    /**
     * MCP HTTP endpoint - supports both POST and GET
     *
     * POST: Client sends JSON-RPC messages
     * GET: Client opens SSE stream for server-initiated messages
     */
    app.post(mcpPath, async (req: Request, res: Response) => {
      // Validate MCP-Protocol-Version header
      const protocolVersion = req.headers['mcp-protocol-version'];
      if (!protocolVersion) {
        logger.error(`Missing MCP-Protocol-Version header`);
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Missing MCP-Protocol-Version header'
          }
        });
      }

      // Get session ID if present
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && !sessions.has(sessionId)) {
        logger.error(`Invalid session ID: ${sessionId}`);
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found'
          }
        });
      }

      await strategy.handlePost(req, res, sessionId);
    });

    app.get(mcpPath, async (req: Request, res: Response) => {
      // Validate Accept header
      const accept = req.headers['accept'];
      if (!accept?.includes('text/event-stream')) {
        logger.error(`GET request without text/event-stream Accept header`);
        return res.status(406).send('Not Acceptable - requires Accept: text/event-stream');
      }

      // Validate MCP-Protocol-Version header
      const protocolVersion = req.headers['mcp-protocol-version'];
      if (!protocolVersion) {
        logger.error(`Missing MCP-Protocol-Version header`);
        return res.status(400).send('Missing MCP-Protocol-Version header');
      }

      // Get session ID if present
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && !sessions.has(sessionId)) {
        logger.error(`Invalid session ID: ${sessionId}`);
        return res.status(404).send('Session not found');
      }

      await strategy.handleGet(req, res, sessionId);
    });

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
      const status = {
        status: 'healthy',
        mode: 'http',
        sessions: sessions.size,
        upstreamEndpoint
      };
      logger.debug('Health check requested', status);
      res.json(status);
    });

    // Start the server - bind to localhost only for security
    app.listen(port, '127.0.0.1', () => {
      logger.system(`MCP HTTP proxy running on http://127.0.0.1:${port}`);
      logger.system(`MCP endpoint: http://127.0.0.1:${port}${mcpPath}`);
      logger.system(`Protocol: Streamable HTTP (MCP 2025-06-18)`);
    });

    // Handle shutdown
    process.on("SIGINT", async () => {
      logger.system("Shutting down proxy...");
      process.exit(0);
    });

  } catch (error) {
    logger.error("Error starting proxy", error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
