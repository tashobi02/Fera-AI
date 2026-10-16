// Allowlist JSON logger (D2B §10.1 Logs, §14; constitution V). Lines use pino's shape
// (numeric `level`, epoch-ms `time`) so pino can replace the sink later. Only the keys
// below are written, and each value must pass its check or it is dropped and its key
// named in `dropped`: bodies, names, phones, free text, tokens, cookies, stacks and
// error messages never reach the output.
import { ERROR_IDS, type ErrorId, type ServerErrorId } from "@/contracts";
import { ERROR_REASONS, type ErrorReason } from "./envelope";

const LEVELS = { info: 30, warn: 40, error: 50 } as const;
export type LogLevel = keyof typeof LEVELS;

export const LOG_EVENTS = [
  "request", "handler.threw", "response.invalid", "envelope.fallback", "audit.unavailable", "submit.draft_token_unverified",
  "auth.principal_invalid", "auth.resolver_stub", "page.viewer_lookup_failed", "page.data_unavailable", "auth.dev_secret", "auth.insecure_cookies", "db.pool_error",
  "db.refusal", "db.rollback_failed", "db.client_error", "db.tx_failed",
  "ratelimit.limited", "ratelimit.unavailable", "ratelimit.degraded", "ratelimit.memory_store", "ratelimit.unknown_address",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export const LOG_STAGES = ["origin", "resolver", "limiter", "input", "authorize", "handler", "response", "audit"] as const;
export type LogStage = (typeof LOG_STAGES)[number];

export type LogIssue = { code: string; path: string };

// Case-service transaction stages (src/server/case/tx.ts).
export const TX_STAGES = ["connect", "begin", "callback", "constraints", "commit", "rollback"] as const;
export type TxStage = (typeof TX_STAGES)[number];

export type LogEntry = {
  event: LogEvent;
  request_id?: string;
  client_request_id?: string;
  route?: string;
  method?: string;
  role?: string;
  status?: number;
  duration_ms?: number;
  error_id?: ErrorId;
  original_error_id?: ErrorId;
  reason?: ErrorReason;
  stage?: LogStage;
  rule?: string;
  err_name?: string;
  err_code?: string;
  err_frame?: string;
  issues?: LogIssue[];
  // Database refusal facts (pg error fields that hold identifiers only, never values).
  constraint?: string;
  table?: string;
  routine?: string;
  tx_stage?: TxStage;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const has = (list: readonly string[]) => (v: unknown) => (typeof v === "string" && list.includes(v) ? v : undefined);
// A phone-shaped digit run (BR-016, ASCII or Bangla digits) is never logged, whatever the key.
const PHONE_LIKE = /(?:0|০)(?:1|১)[0-9০-৯]{9}/;
const matches = (re: RegExp) => (v: unknown) =>
  typeof v === "string" && re.test(v) && !PHONE_LIKE.test(v) ? v : undefined;
const ISSUE_CODE = /^[a-z_]{1,40}$/;
const ISSUE_PATH = /^[A-Za-z0-9_.]{0,200}$/;

// Each check returns the value to write, or undefined to drop it.
const CHECKS: { [K in keyof LogEntry]-?: (v: unknown) => unknown } = {
  event: has(LOG_EVENTS),
  request_id: matches(UUID),
  client_request_id: matches(UUID),
  route: matches(/^API-\d{3}$/),
  method: has(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]),
  role: has(["parent", "staff", "officer", "admin", "anonymous"]),
  status: (v) => (Number.isInteger(v) && (v as number) >= 100 && (v as number) <= 599 ? v : undefined),
  duration_ms: (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined),
  error_id: has(ERROR_IDS),
  original_error_id: has(ERROR_IDS),
  reason: has(ERROR_REASONS),
  stage: has(LOG_STAGES),
  rule: matches(/^[a-z.]{1,40}$/),
  err_name: matches(/^[A-Za-z0-9_.]{1,60}$/),
  err_code: matches(/^[A-Z0-9_]{1,32}$/),
  err_frame: matches(/^[A-Za-z0-9_.\-[\]]{1,80}:\d{1,7}$/),
  constraint: matches(/^[a-z_][a-z0-9_]{0,62}$/),
  table: matches(/^[a-z_][a-z0-9_]{0,62}$/),
  routine: matches(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/),
  tx_stage: has(TX_STAGES),
  issues: (v) => {
    if (!Array.isArray(v)) return undefined;
    const kept = v
      .slice(0, 5)
      .filter(
        (i) =>
          i &&
          typeof i.code === "string" &&
          ISSUE_CODE.test(i.code) &&
          typeof i.path === "string" &&
          ISSUE_PATH.test(i.path) &&
          !PHONE_LIKE.test(i.path),
      )
      .map((i: LogIssue) => ({ code: i.code, path: i.path }));
    return kept.length > 0 ? kept : undefined;
  },
};
const ALLOWED = new Set(Object.keys(CHECKS));

export type LogSink = (line: string) => void;

const SINK_FAILED_LINE = '{"level":50,"event":"log.sink_failed"}\n';
const SINK_FAILED_INTERVAL_MS = 60_000;

export function createLogger(
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  now: () => number = Date.now,
  fallback: (line: string) => void = (line) => process.stderr.write(line),
) {
  let lastSinkFailure = Number.NEGATIVE_INFINITY;
  const write = (level: LogLevel, entry: LogEntry) => {
    const line: Record<string, unknown> = { level: LEVELS[level], time: now() };
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (value === undefined) continue;
      if (!ALLOWED.has(key)) {
        if (!dropped.includes("_unknown")) dropped.push("_unknown");
        continue;
      }
      const safe = CHECKS[key as keyof LogEntry](value);
      if (safe === undefined) dropped.push(key);
      else line[key] = safe;
    }
    if (dropped.length > 0) line.dropped = dropped;
    try {
      sink(JSON.stringify(line));
    } catch {
      // Logging never breaks a response; report the failure, rate-limited, with a fixed line.
      const t = now();
      if (t - lastSinkFailure >= SINK_FAILED_INTERVAL_MS) {
        lastSinkFailure = t;
        try {
          fallback(SINK_FAILED_LINE);
        } catch {
          // nothing left to report to
        }
      }
    }
  };
  return {
    info: (entry: LogEntry) => write("info", entry),
    warn: (entry: LogEntry) => write("warn", entry),
    error: (entry: LogEntry) => write("error", entry),
  };
}
export type Logger = ReturnType<typeof createLogger>;

// D2B §13 developer-log levels per error ID; a success is info.
const LEVEL_BY_ERROR: Record<ServerErrorId, LogLevel> = {
  "E-001": "warn", "E-002": "info", "E-003": "warn", "E-004": "warn", "E-005": "warn", "E-006": "warn",
  "E-007": "warn", "E-008": "info", "E-009": "info", "E-010": "info", "E-011": "error", "E-012": "error",
  "E-013": "error", "E-014": "warn", "E-015": "info", "E-016": "error", "E-017": "warn", "E-018": "info",
  "E-019": "info", "E-020": "warn", "E-021": "error", "E-023": "warn",
};

export function levelFor(status: number, errorId?: ServerErrorId): LogLevel {
  if (errorId !== undefined && errorId in LEVEL_BY_ERROR) return LEVEL_BY_ERROR[errorId];
  return status >= 500 ? "error" : "info";
}

// Safe facts about an unexpected error: class name, a code token (SQLSTATE, errno) and
// the top stack frame as file:line. The message, and any frame text inside it, is skipped.
export function describeError(err: unknown): Pick<LogEntry, "err_name" | "err_code" | "err_frame"> {
  if (!(err instanceof Error)) return {};
  const code = (err as { code?: unknown }).code;
  let frame: string | undefined;
  const head = String(err);
  if (typeof err.stack === "string" && err.stack.startsWith(head)) {
    for (const line of err.stack.slice(head.length).split("\n")) {
      const m = /^\s+at (?:.*\()?(.+?):(\d+):\d+\)?$/.exec(line);
      if (m) {
        frame = `${m[1].split(/[\\/]/).pop()}:${m[2]}`;
        break;
      }
    }
  }
  return {
    err_name: err.name,
    err_code: typeof code === "string" ? code : undefined,
    err_frame: frame,
  };
}

// Up to five Zod issue codes and paths (field names, never values or messages).
export function issueTokens(issues: readonly { code: string; path: readonly PropertyKey[] }[]): LogIssue[] {
  return issues.slice(0, 5).map((i) => ({ code: i.code, path: i.path.map(String).join(".") }));
}
