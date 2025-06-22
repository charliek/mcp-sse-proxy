import { Request, Response, Express } from 'express';
import { InputStrategy, SessionInfo, InputConfig } from './InputStrategy.js';
import { OutputStrategy } from './OutputStrategy.js';

export class StreamableHttpInputStrategy implements InputStrategy {
  name = 'streamable';
  private config!: InputConfig;

  setupRoutes(app: Express, config: InputConfig): void {
    this.config = config;

    // Streamable HTTP endpoint for MCP clients
    app.post(config.httpEndpoint, async (req: Request, res: Response) => {
      const outputStrategy = (req as any).outputStrategy;
      const sessionInfo = await this.handleConnection(req, res, outputStrategy);
      
      try {
        // Handle the incoming request
        await outputStrategy.handleMessage(sessionInfo, req.body);
        
        // For streamable HTTP, we don't send a 202 - the response will be streamed
      } catch (error: any) {
        this.config.logger.error(`Error handling streamable HTTP request`, error);
        
        // Send error response
        const errorResponse = {
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: error.message || 'Internal error',
            data: error.stack
          }
        };
        
        res.write(JSON.stringify(errorResponse) + '\n');
        res.end();
      }
    });
  }

  async handleConnection(req: Request, res: Response, outputStrategy: OutputStrategy): Promise<SessionInfo> {
    const sessionId = `http-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.config.logger.connection(`New streamable HTTP connection: ${sessionId}`);
    
    // Set streaming headers
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });
    
    // Create session info
    const sessionInfo: SessionInfo = {
      sessionId,
      inputStrategy: this,
      outputStrategy,
      httpResponse: res
    };
    
    this.config.logger.request(`Received streamable HTTP request`, req.body);
    
    // Handle disconnect
    req.on('close', () => {
      this.config.logger.connection(`Streamable HTTP connection ${sessionId} closed`);
      if (this.handleDisconnect) {
        this.handleDisconnect(sessionInfo);
      }
    });
    
    return sessionInfo;
  }

  sendResponse(sessionInfo: SessionInfo, response: any): void {
    if (!sessionInfo.httpResponse) {
      this.config.logger.error(`No HTTP response for session ${sessionInfo.sessionId}`);
      return;
    }

    const httpResponse = sessionInfo.httpResponse;
    
    // Write newline-delimited JSON
    httpResponse.write(JSON.stringify(response) + '\n');
    this.config.logger.response(`Sent to streamable HTTP client`, response);
    
    // Check if this is the final response (has an id and is not a notification)
    if (response.id !== undefined) {
      // End the response after sending the final result
      httpResponse.end();
      this.config.logger.connection(`Ended streamable HTTP response for ${sessionInfo.sessionId}`);
    }
  }

  handleDisconnect(sessionInfo: SessionInfo): void {
    // Cleanup is minimal for HTTP connections as they are short-lived
  }
}