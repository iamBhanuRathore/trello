import { env } from './env';

/**
 * Structured logger — uses console.error/warn/info with JSON payloads in production,
 * and human-readable output in development.
 * Replace with pino or @opentelemetry/api when observability stack is wired up.
 */
const isDev = env.NODE_ENV === 'development';

function formatLog(level: string, data: Record<string, unknown>, msg: string): string {
  const orgId = data.org_id || data.orgId;
  if (isDev) {
    const prefix = `[${new Date().toISOString()}] ${level.toUpperCase()}`;
    const orgTag = orgId ? ` [org:${orgId}]` : '';
    const dataStr = Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    return `${prefix}${orgTag} ${msg}${dataStr}`;
  }
  return JSON.stringify({
    level,
    msg,
    ...(orgId ? { org_id: orgId } : {}),
    ...data,
    time: Date.now(),
  });
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
  child: (context: Record<string, unknown>) => ({
    info: (data: Record<string, unknown>, msg: string) => {
      console.info(formatLog('info', { ...context, ...data }, msg));
    },
    warn: (data: Record<string, unknown>, msg: string) => {
      console.warn(formatLog('warn', { ...context, ...data }, msg));
    },
    error: (data: Record<string, unknown>, msg: string) => {
      console.error(formatLog('error', { ...context, ...data }, msg));
    },
    debug: (data: Record<string, unknown>, msg: string) => {
      if (isDev) {
        console.debug(formatLog('debug', { ...context, ...data }, msg));
      }
    },
  }),
};
