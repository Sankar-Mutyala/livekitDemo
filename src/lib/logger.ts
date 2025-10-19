// Production-grade logging utility
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory

  private constructor() {
    this.logLevel = process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (level < this.logLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };

    this.logs.push(entry);
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output
    const levelName = LogLevel[level];
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    const errorStr = error ? ` Error: ${error.message}` : '';
    
    const logMessage = `[${levelName}] ${message}${contextStr}${errorStr}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        if (error) {
          console.error(error.stack);
        }
        break;
    }

    // In production, you might want to send logs to a monitoring service
    if (process.env.NODE_ENV === 'production' && level >= LogLevel.ERROR) {
      this.sendToMonitoringService(entry);
    }
  }

  private sendToMonitoringService(entry: LogEntry): void {
    // Here you would integrate with your monitoring service
    // Examples: Sentry, LogRocket, DataDog, etc.
    
    // Example for Sentry:
    // if (window.Sentry) {
    //   window.Sentry.captureException(entry.error || new Error(entry.message), {
    //     extra: entry.context,
    //     tags: { component: 'livekit-app' }
    //   });
    // }
    
    // For now, we'll just store in localStorage for debugging
    try {
      const existingLogs = JSON.parse(localStorage.getItem('app-logs') || '[]');
      existingLogs.push(entry);
      localStorage.setItem('app-logs', JSON.stringify(existingLogs.slice(-100))); // Keep last 100 in localStorage
    } catch (e) {
      console.warn('Failed to store log in localStorage:', e);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // Get logs for debugging
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Clear logs
  clearLogs(): void {
    this.logs = [];
  }

  // Set log level
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

export const logger = Logger.getInstance();

// Performance monitoring
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();

  static startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  static endTimer(name: string): string {
    const startTime = this.timers.get(name);
    if (!startTime) {
      logger.warn(`Timer '${name}' was not started`);
      return '0ms';
    }

    const duration = performance.now() - startTime;
    this.timers.delete(name);
    
    const durationStr = `${duration.toFixed(2)}ms`;
    logger.info(`Performance: ${name} took ${durationStr}`);
    
    return durationStr;
  }

  static measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.startTimer(name);
    return fn().finally(() => {
      this.endTimer(name);
    });
  }
}

// Connection health monitoring
export class ConnectionHealthMonitor {
  private static instance: ConnectionHealthMonitor;
  private healthChecks: Map<string, () => Promise<boolean>> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): ConnectionHealthMonitor {
    if (!ConnectionHealthMonitor.instance) {
      ConnectionHealthMonitor.instance = new ConnectionHealthMonitor();
    }
    return ConnectionHealthMonitor.instance;
  }

  addHealthCheck(name: string, check: () => Promise<boolean>): void {
    this.healthChecks.set(name, check);
  }

  removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      const results = await this.runHealthChecks();
      const failedChecks = results.filter(([name, isHealthy]) => !isHealthy);
      
      if (failedChecks.length > 0) {
        logger.warn('Health check failures detected', {
          failedChecks: failedChecks.map(([name]) => name),
          timestamp: new Date().toISOString(),
        });
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async runHealthChecks(): Promise<[string, boolean][]> {
    const results: [string, boolean][] = [];
    
    // Convert Map to Array to avoid iteration issues
    const healthCheckEntries = Array.from(this.healthChecks.entries());
    
    for (const [name, check] of healthCheckEntries) {
      try {
        const isHealthy = await check();
        results.push([name, isHealthy]);
      } catch (error) {
        logger.error(`Health check '${name}' failed`, error as Error);
        results.push([name, false]);
      }
    }
    
    return results;
  }
}

export const connectionHealthMonitor = ConnectionHealthMonitor.getInstance();
