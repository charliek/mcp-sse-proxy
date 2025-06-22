import { Request, Response, Express } from 'express';
import { OutputStrategy } from './OutputStrategy.js';

export interface SessionInfo {
  sessionId: string;
  inputStrategy: InputStrategy;
  outputStrategy: OutputStrategy;
  inputConnection?: Response; // SSE response object, undefined for HTTP
  httpResponse?: Response; // HTTP response for streamable input
}

export interface InputStrategy {
  name: string;
  setupRoutes(app: Express, config: InputConfig): void;
  handleConnection(req: Request, res: Response, outputStrategy: OutputStrategy): Promise<SessionInfo>;
  sendResponse(sessionInfo: SessionInfo, response: any): void;
  handleDisconnect?(sessionInfo: SessionInfo): void;
}

export interface InputConfig {
  port: number;
  sseEndpoint: string;
  httpEndpoint: string;
  logger: any;
}