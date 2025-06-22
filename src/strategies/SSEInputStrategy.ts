import { Request, Response, Express } from 'express';
import { InputStrategy, SessionInfo, InputConfig } from './InputStrategy.js';
import { OutputStrategy } from './OutputStrategy.js';

export class SSEInputStrategy implements InputStrategy {
  name = 'sse';
  private config!: InputConfig;
  private sessions = new Map<string, SessionInfo>();

  setupRoutes(app: Express, config: InputConfig): void {
    this.config = config;

    // SSE endpoint for MCP clients to connect to
    app.get(config.sseEndpoint, async (req: Request, res: Response) => {
      // This will be handled by handleConnection
      const outputStrategy = (req as any).outputStrategy;
      await this.handleConnection(req, res, outputStrategy);
    });

    // Endpoint for receiving messages from SSE client
    app.post('/messages/:sessionId', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const sessionInfo = this.sessions.get(sessionId);
      
      if (!sessionInfo) {
        this.config.logger.error(`Session not found: ${sessionId}`);
        return res.status(404).json({ error: 'Session not found' });
      }
      
      try {
        // Let the output strategy handle the message
        await sessionInfo.outputStrategy.handleMessage(sessionInfo, req.body);
        
        // Respond to the POST request with empty 202 as per MCP SSE spec
        res.status(202).send();
      } catch (error) {
        this.config.logger.error(`Error handling message from ${sessionId}`, error);
        res.status(202).send();
      }
    });
  }

  async handleConnection(req: Request, res: Response, outputStrategy: OutputStrategy): Promise<SessionInfo> {
    const sessionId = Date.now().toString();
    this.config.logger.connection(`New SSE connection initiated: ${sessionId}`);
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });
    
    try {
      // Create session info
      const sessionInfo: SessionInfo = {
        sessionId,
        inputStrategy: this,
        outputStrategy,
        inputConnection: res
      };
      
      // Store the session
      this.sessions.set(sessionId, sessionInfo);
      
      // Send initial endpoint event (MCP SSE protocol)
      const endpointPath = `messages/${sessionId}`;
      const endpointEvent = `event: endpoint\ndata: ${endpointPath}\n\n`;
      res.write(endpointEvent);
      
      this.config.logger.connection(`Client ${sessionId} connected`);
      this.config.logger.sse(`Sent SSE endpoint event`, { event: 'endpoint', data: endpointPath });
      
      // Let the output strategy handle the connection if needed
      if (outputStrategy.handleConnection) {
        await outputStrategy.handleConnection(sessionInfo);
      }
      
      // Keep the connection alive
      const heartbeatInterval = setInterval(() => {
        if (res.socket?.destroyed) {
          clearInterval(heartbeatInterval);
        } else {
          res.write(':ping\n\n');
          this.config.logger.debug(`Sent heartbeat to ${sessionId}`);
        }
      }, 30000); // Send heartbeat every 30 seconds
      
      // Handle client disconnect
      req.on('close', () => {
        clearInterval(heartbeatInterval);
        this.sessions.delete(sessionId);
        this.config.logger.connection(`Client ${sessionId} disconnected`);
        
        if (this.handleDisconnect) {
          this.handleDisconnect(sessionInfo);
        }
      });
      
      return sessionInfo;
    } catch (error: any) {
      this.config.logger.error(`Failed to setup SSE connection for ${sessionId}`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'Failed to setup connection' })}\n\n`);
      res.end();
      throw error;
    }
  }

  sendResponse(sessionInfo: SessionInfo, response: any): void {
    if (!sessionInfo.inputConnection) {
      this.config.logger.error(`No SSE connection for session ${sessionInfo.sessionId}`);
      return;
    }

    const sseResponse = sessionInfo.inputConnection;
    sseResponse.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    this.config.logger.sse(`Sent to SSE client`, response);
  }

  handleDisconnect(sessionInfo: SessionInfo): void {
    // Cleanup handled by the close event listener in handleConnection
  }
}