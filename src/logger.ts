import chalk, { ChalkInstance } from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log categories
export enum LogCategory {
  CONNECTION = 'CONNECTION',
  REQUEST = 'REQUEST',
  FORWARD = 'FORWARD',
  RESPONSE = 'RESPONSE',
  SSE = 'SSE',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
  SYSTEM = 'SYSTEM'
}

// Log level configuration
interface LogLevel {
  enabled: boolean;
  color: keyof ChalkInstance;
  showPayload?: boolean;
}

// Overall logging configuration
interface LogConfig {
  levels: Record<LogCategory, LogLevel>;
  showTimestamps: boolean;
  showPayloads: boolean; // Default for all levels
}

// Default configuration
const DEFAULT_CONFIG: LogConfig = {
  levels: {
    [LogCategory.CONNECTION]: { enabled: true, color: 'green' },
    [LogCategory.REQUEST]: { enabled: true, color: 'cyan', showPayload: true },
    [LogCategory.FORWARD]: { enabled: true, color: 'yellow', showPayload: true },
    [LogCategory.RESPONSE]: { enabled: true, color: 'magenta', showPayload: true },
    [LogCategory.SSE]: { enabled: false, color: 'blue', showPayload: false },
    [LogCategory.ERROR]: { enabled: true, color: 'red', showPayload: true },
    [LogCategory.DEBUG]: { enabled: false, color: 'gray', showPayload: true },
    [LogCategory.SYSTEM]: { enabled: true, color: 'white' }
  },
  showTimestamps: true,
  showPayloads: false  // Global default if not specified per level
};

export class Logger {
  private config: LogConfig;

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath?: string): LogConfig {
    let config = { ...DEFAULT_CONFIG };

    // Try to load from file
    const filePath = configPath || path.join(__dirname, '..', 'logging.config.json');
    try {
      if (fs.existsSync(filePath)) {
        const fileConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        config = this.mergeConfig(config, fileConfig);
      }
    } catch (error) {
      console.error(`Failed to load logging config from ${filePath}:`, error);
    }

    // Override with environment variables
    config = this.applyEnvOverrides(config);

    return config;
  }

  private mergeConfig(defaultConfig: LogConfig, fileConfig: Partial<LogConfig>): LogConfig {
    const merged = { ...defaultConfig };

    if (fileConfig.levels) {
      for (const [category, settings] of Object.entries(fileConfig.levels)) {
        if (category in merged.levels) {
          merged.levels[category as LogCategory] = {
            ...merged.levels[category as LogCategory],
            ...settings
          };
        }
      }
    }

    if (fileConfig.showTimestamps !== undefined) {
      merged.showTimestamps = fileConfig.showTimestamps;
    }

    if (fileConfig.showPayloads !== undefined) {
      merged.showPayloads = fileConfig.showPayloads;
    }

    return merged;
  }

  private applyEnvOverrides(config: LogConfig): LogConfig {
    const result = { ...config };

    // Enable/disable specific log levels
    const logLevels = process.env.LOG_LEVELS;
    if (logLevels) {
      // First disable all levels, then enable only specified ones
      for (const category of Object.values(LogCategory)) {
        result.levels[category].enabled = false;
      }
      
      const enabledLevels = logLevels.split(',').map(l => l.trim().toUpperCase());
      for (const level of enabledLevels) {
        if (level in LogCategory) {
          result.levels[level as LogCategory].enabled = true;
        }
      }
    }

    // Override colors
    const logColors = process.env.LOG_COLORS;
    if (logColors) {
      const colorOverrides = logColors.split(',').map(c => c.trim().split(':'));
      for (const [category, color] of colorOverrides) {
        if (category.toUpperCase() in LogCategory) {
          result.levels[category.toUpperCase() as LogCategory].color = color as keyof ChalkInstance;
        }
      }
    }

    // Show payloads globally
    if (process.env.LOG_SHOW_PAYLOADS !== undefined) {
      result.showPayloads = process.env.LOG_SHOW_PAYLOADS === 'true';
    }

    // Per-category payload settings (e.g., REQUEST:true,RESPONSE:false)
    const logPayloads = process.env.LOG_PAYLOADS;
    if (logPayloads) {
      const payloadOverrides = logPayloads.split(',').map(p => p.trim().split(':'));
      for (const [category, show] of payloadOverrides) {
        if (category.toUpperCase() in LogCategory) {
          result.levels[category.toUpperCase() as LogCategory].showPayload = show === 'true';
        }
      }
    }

    // Show timestamps
    if (process.env.LOG_SHOW_TIMESTAMPS !== undefined) {
      result.showTimestamps = process.env.LOG_SHOW_TIMESTAMPS === 'true';
    }

    return result;
  }

  private formatTimestamp(): string {
    if (!this.config.showTimestamps) return '';
    const now = new Date();
    return `[${now.toISOString()}] `;
  }

  private formatMessage(category: LogCategory, message: string, payload?: any): string {
    const timestamp = this.formatTimestamp();
    const categoryTag = `[${category}]`;
    
    let formatted = `${timestamp}${categoryTag} ${message}`;
    
    // Check if payload should be shown for this category
    const levelConfig = this.config.levels[category];
    const showPayload = levelConfig.showPayload !== undefined 
      ? levelConfig.showPayload 
      : this.config.showPayloads;
    
    if (payload && showPayload) {
      formatted += '\n' + JSON.stringify(payload, null, 2);
    }
    
    return formatted;
  }

  log(category: LogCategory, message: string, payload?: any): void {
    const levelConfig = this.config.levels[category];
    
    if (!levelConfig?.enabled) {
      return;
    }

    const color = levelConfig.color;
    const formatted = this.formatMessage(category, message, payload);
    
    // Apply color and output
    const colorFunc = chalk[color as keyof ChalkInstance] as any;
    if (typeof colorFunc === 'function') {
      console.log(colorFunc(formatted));
    } else {
      console.log(formatted);
    }
  }

  // Convenience methods
  connection(message: string, payload?: any): void {
    this.log(LogCategory.CONNECTION, message, payload);
  }

  request(message: string, payload?: any): void {
    this.log(LogCategory.REQUEST, message, payload);
  }

  forward(message: string, payload?: any): void {
    this.log(LogCategory.FORWARD, message, payload);
  }

  response(message: string, payload?: any): void {
    this.log(LogCategory.RESPONSE, message, payload);
  }

  sse(message: string, payload?: any): void {
    this.log(LogCategory.SSE, message, payload);
  }

  error(message: string, payload?: any): void {
    this.log(LogCategory.ERROR, message, payload);
  }

  debug(message: string, payload?: any): void {
    this.log(LogCategory.DEBUG, message, payload);
  }

  system(message: string, payload?: any): void {
    this.log(LogCategory.SYSTEM, message, payload);
  }
}

// Export a singleton instance
export const logger = new Logger();