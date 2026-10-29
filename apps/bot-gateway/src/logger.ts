import type { LogLevel } from './config.js';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel, base: Record<string, unknown> = {}): Logger {
  const threshold = ORDER[level];
  const write = (entryLevel: LogLevel, message: string, fields?: Record<string, unknown>): void => {
    if (ORDER[entryLevel] < threshold) return;
    const payload = {
      ts: new Date().toISOString(),
      level: entryLevel,
      msg: message,
      ...base,
      ...fields,
    };
    const line = JSON.stringify(payload);
    if (entryLevel === 'error') console.error(line);
    else if (entryLevel === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }),
  };
}
