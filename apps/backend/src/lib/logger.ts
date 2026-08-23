import { env } from './env';

/**
 * Structured logger — uses console.error/warn/info with JSON payloads in production,
 * and human-readable output in development.
 * Replace with pino or @opentelemetry/api when observability stack is wired up.
 */
const isDev = env.NODE_ENV === 'development';

function formatLog(level: string, data: Record<string, unknown>, msg: string): string {
  if (isDev) {
    const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
    const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    return `${prefix} ${msg}${dataStr}`;
  }
  return JSON.stringify({ level, msg, ...data, time: Date.now() });
}

export const logger = {
  info: (data: Record<string, unknown>, msg: string) => {
    console.info(formatLog('info', data, msg));
  },
  warn: (data: Record<string, unknown>, msg: string) => {
    console.warn(formatLog('warn', data, msg));
  },
  error: (data: Record<string, unknown>, msg: string) => {
    console.error(formatLog('error', data, msg));
  },
  debug: (data: Record<string, unknown>, msg: string) => {
    if (isDev) {
      console.debug(formatLog('debug', data, msg));
    }
  },
};
