import axios from 'axios';
import { OutputStrategy, OutputConfig } from './OutputStrategy.js';
import { SessionInfo } from './InputStrategy.js';

export class StreamableHttpOutputStrategy implements OutputStrategy {
  name = 'streamable';
  private config!: OutputConfig;

  configure(config: OutputConfig): void {
    this.config = config;
  }

  async handleMessage(sessionInfo: SessionInfo, request: any): Promise<void> {
    try {
      const { jsonrpc, method, params, id } = request;
      
      this.config.logger.request(`Received message from client ${sessionInfo.sessionId}: ${method} (id: ${id})`, request);
      
      // Forward the request to the streamable endpoint
      const streamResponse = await this.sendToStreamableEndpoint(method, params, id);
      
      // Process the streaming response
      streamResponse.on('data', (chunk: Buffer) => {
        try {
          // The streamable endpoint might send multiple JSON-RPC responses
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              this.config.logger.response(`Received from MCP server`, response);
              
              // Send the response back through the input strategy
              sessionInfo.inputStrategy.sendResponse(sessionInfo, response);
            } catch (parseError) {
              // If line is not valid JSON, skip it
              this.config.logger.debug(`Invalid JSON in stream response: ${line}`);
            }
          }
        } catch (error) {
          this.config.logger.error(`Error processing stream chunk`, error);
        }
      });
      
      streamResponse.on('end', () => {
        this.config.logger.debug(`Stream ended for request ${id} (method: ${method})`);
      });
      
      streamResponse.on('error', (error: Error) => {
        this.config.logger.error(`Stream error for request ${id}`, error);
        
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
        
        sessionInfo.inputStrategy.sendResponse(sessionInfo, errorResponse);
      });
    } catch (error: any) {
      this.config.logger.error(`Error forwarding request from ${sessionInfo.sessionId}`, error);
      
      // Send error response through SSE
      const errorResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error',
          data: error.stack
        }
      };
      
      sessionInfo.inputStrategy.sendResponse(sessionInfo, errorResponse);
    }
  }

  private async sendToStreamableEndpoint(method: string, params: any, id: string | number): Promise<NodeJS.ReadableStream> {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    this.config.logger.forward(`Sending to MCP server`, request);

    const response = await axios.post(this.config.endpoint, request, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    });

    return response.data as NodeJS.ReadableStream;
  }
}