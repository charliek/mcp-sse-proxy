import { Request, Response } from 'express';

export interface ProxyStrategy {
  name: string;
  configure(config: ProxyConfig): void;
  handleMessage(sessionId: string, request: any, sseResponse: Response): Promise<void>;
  handleConnection?(sessionId: string, sseResponse: Response): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface ProxyConfig {
  endpoint: string;
  port: number;
  sseEndpoint: string;
  logger: any;
}