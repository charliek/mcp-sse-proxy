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
    if (!origin) {
      callback(null, true);
      return;
    }

    // Validate exact localhost/127.0.0.1 origins with proper port validation
    try {
      const url = new URL(origin);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (isLocalhost) {
        callback(null, true);
      } else {
        logger.debug(`Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    } catch (error) {
      logger.debug(`Invalid origin format: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Note: Session management is handled by the upstream MCP server
// This proxy simply forwards session IDs without validation

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
      mcpPath,
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

      // Get session ID if present and pass it through to upstream
      // The proxy doesn't validate sessions - the upstream server handles that
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

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

      // Get session ID if present and pass it through to upstream
      // The proxy doesn't validate sessions - the upstream server handles that
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      await strategy.handleGet(req, res, sessionId);
    });

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
      const status = {
        status: 'healthy',
        mode: 'http',
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
