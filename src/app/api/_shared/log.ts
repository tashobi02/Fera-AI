// Allowlist JSON logger (D2B §10.1 Logs, §14; constitution V). Lines use pino's shape
// (numeric `level`, epoch-ms `time`) so pino can replace the sink later. Only the keys
// below are written, and each value must pass its check or it is dropped: bodies,
// names, phones, free text, tokens, cookies, stacks and error messages never reach it.
import { ERROR_IDS, type ErrorId } from "@/contracts";

const LEVELS = { info: 30, warn: 40, error: 50 } as const;
export type LogLevel = keyof typeof LEVELS;

export const LOG_EVENTS = ["request", "handler.threw", "response.invalid", "ratelimit.limited", "ratelimit.unavailable", "ratelimit.degraded"] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export type LogEntry = {
  event: LogEvent;
  request_id?: string;
  route?: string;
  method?: string;
  role?: string;
  status?: number;
  duration_ms?: number;
  error_id?: ErrorId;
  rule?: string;
  err_name?: string;
};

const has = (list: readonly string[]) => (v: unknown) => typeof v === "string" && list.includes(v);
const matches = (re: RegExp) => (v: unknown) => typeof v === "string" && re.test(v);

const CHECKS: { [K in keyof LogEntry]-?: (v: unknown) => boolean } = {
  event: has(LOG_EVENTS),
  request_id: matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  route: matches(/^API-\d{3}$/),
  method: has(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]),
  role: has(["parent", "staff", "officer", "admin", "anonymous"]),
  status: (v) => Number.isInteger(v) && (v as number) >= 100 && (v as number) <= 599,
  duration_ms: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  error_id: has(ERROR_IDS),
  rule: matches(/^[a-z.]{1,40}$/),
  err_name: matches(/^[A-Za-z]{1,40}$/),
};

export type LogSink = (line: string) => void;

export function createLogger(sink: LogSink = (line) => process.stdout.write(`${line}\n`), now: () => number = Date.now) {
  const write = (level: LogLevel, entry: LogEntry) => {
    const line: Record<string, unknown> = { level: LEVELS[level], time: now() };
    for (const key of Object.keys(CHECKS) as (keyof LogEntry)[]) {
      const value = (entry as Record<string, unknown>)[key];
      if (value !== undefined && CHECKS[key](value)) line[key] = key === "duration_ms" ? Math.round(value as number) : value;
    }
    try {
      sink(JSON.stringify(line));
    } catch {
      // Logging must never break a response.
    }
  };
  return {
    info: (entry: LogEntry) => write("info", entry),
    warn: (entry: LogEntry) => write("warn", entry),
    error: (entry: LogEntry) => write("error", entry),
  };
}
export type Logger = ReturnType<typeof createLogger>;

// D2B §13 developer-log levels: server errors at error, expected client states at info.
const INFO_ERRORS: readonly ErrorId[] = ["E-002", "E-008", "E-009", "E-010", "E-015", "E-018", "E-019"];
export function levelFor(status: number, errorId?: ErrorId): LogLevel {
  if (status >= 500) return "error";
  if (errorId === undefined || INFO_ERRORS.includes(errorId)) return "info";
  return "warn";
}
