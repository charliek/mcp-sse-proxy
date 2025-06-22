import express, { Request, Response } from 'express';
import cors from 'cors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { logger, LogCategory } from './logger.js';
import { InputStrategy, SessionInfo, InputConfig } from './strategies/InputStrategy.js';
import { OutputStrategy, OutputConfig } from './strategies/OutputStrategy.js';
import { SSEInputStrategy } from './strategies/SSEInputStrategy.js';
import { StreamableHttpInputStrategy } from './strategies/StreamableHttpInputStrategy.js';
import { StreamableHttpOutputStrategy } from './strategies/StreamableHttpOutputStrategy.js';
import { SSEOutputStrategy } from './strategies/SSEOutputStrategy.js';

// Parse command-line arguments
const argv = yargs(hideBin(process.argv))
  .option('input-mode', {
    type: 'string',
    choices: ['streamable', 'sse'],
    default: 'sse',
    description: 'Input mode: how clients connect to proxy'
  })
  .option('output-mode', {
    type: 'string',
    choices: ['streamable', 'sse'],
    default: 'streamable',
    description: 'Output mode: how proxy connects to upstream'
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
  .option('http-endpoint', {
    type: 'string',
    default: '/mcp',
    description: 'HTTP endpoint path for streamable input'
  })
  .help()
  .argv as any;

// Default endpoints based on output mode
const DEFAULT_ENDPOINTS: Record<string, string> = {
  streamable: 'http://localhost:8080/mcp',
  sse: 'http://localhost:8080/sse'
};

const endpoint = argv.endpoint || DEFAULT_ENDPOINTS[argv.outputMode];
const port = argv.port;
const sseEndpoint = argv.sseEndpoint;
const httpEndpoint = argv.httpEndpoint;

// Create Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Store active sessions
const sessions = new Map<string, SessionInfo>();

// Create input strategy based on mode
function createInputStrategy(mode: string): InputStrategy {
  switch (mode) {
    case 'streamable':
      return new StreamableHttpInputStrategy();
    case 'sse':
    default:
      return new SSEInputStrategy();
  }
}

// Create output strategy based on mode
function createOutputStrategy(mode: string): OutputStrategy {
  switch (mode) {
    case 'sse':
      return new SSEOutputStrategy();
    case 'streamable':
    default:
      return new StreamableHttpOutputStrategy();
  }
}

async function main() {
  try {
    logger.system(`Starting MCP proxy: ${argv.inputMode} → ${argv.outputMode}`);
    logger.system(`Port: ${port}`);
    logger.system(`Input endpoint: ${argv.inputMode === 'sse' ? `http://localhost:${port}${sseEndpoint}` : `http://localhost:${port}${httpEndpoint}`}`);
    logger.system(`Upstream endpoint: ${endpoint}`);

    // Create input and output strategies
    const inputStrategy = createInputStrategy(argv.inputMode);
    const outputStrategy = createOutputStrategy(argv.outputMode);
    
    // Configure strategies
    const inputConfig: InputConfig = {
      port,
      sseEndpoint,
      httpEndpoint,
      logger
    };
    
    const outputConfig: OutputConfig = {
      endpoint,
      logger
    };
    
    outputStrategy.configure(outputConfig);
    
    // Add middleware to attach output strategy to requests
    app.use((req, res, next) => {
      (req as any).outputStrategy = outputStrategy;
      next();
    });
    
    // Setup routes for input strategy
    inputStrategy.setupRoutes(app, inputConfig);

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
      const status = { 
        status: 'healthy', 
        inputMode: argv.inputMode,
        outputMode: argv.outputMode,
        sessions: sessions.size 
      };
      logger.debug('Health check requested', status);
      res.json(status);
    });

    // Start the server
    app.listen(port, '0.0.0.0', () => {
      logger.system(`Proxy server running on http://0.0.0.0:${port}`);
      logger.system(`Input: ${argv.inputMode} | Output: ${argv.outputMode}`);
      if (argv.inputMode === 'sse') {
        logger.system(`SSE endpoint: http://0.0.0.0:${port}${sseEndpoint}`);
      } else {
        logger.system(`HTTP endpoint: http://0.0.0.0:${port}${httpEndpoint}`);
      }
    });
    
    // Handle shutdown
    process.on("SIGINT", async () => {
      logger.system("Shutting down proxy...");
      
      // Let output strategy clean up
      if (outputStrategy.shutdown) {
        await outputStrategy.shutdown();
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