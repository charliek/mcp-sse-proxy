import { Response } from 'express';
import { SessionInfo } from './InputStrategy.js';

export interface OutputStrategy {
  name: string;
  configure(config: OutputConfig): void;
  handleMessage(sessionInfo: SessionInfo, request: any): Promise<void>;
  handleConnection?(sessionInfo: SessionInfo): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface OutputConfig {
  endpoint: string;
  logger: any;
}