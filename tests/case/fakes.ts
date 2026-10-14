// Scripted pg fakes for case-service unit tests (TASK-015). Each query is matched
// against the handlers in order; the first matching handler answers it. Unmatched
// statements (BEGIN, SAVEPOINT, COMMIT, …) answer with no rows. Every query is
// recorded so tests can assert what was, and was not, sent.
import type { PoolClient } from "pg";

export type Recorded = { text: string; values: unknown[] };
export type Handler = { match: RegExp; reply: (values: unknown[], calls: Recorded[]) => unknown[] | Error };

export function fakePool(handlers: Handler[]) {
  const calls: Recorded[] = [];
  let connects = 0;
  let releases = 0;
  const client = {
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      for (const h of handlers) {
        if (h.match.test(text)) {
          const out = h.reply(values, calls);
          if (out instanceof Error) throw out;
          return { rows: out, rowCount: out.length };
        }
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      releases++;
    },
  };
  const pool = {
    async connect() {
      connects++;
      return client as unknown as PoolClient;
    },
  };
  return {
    pool,
    calls,
    sent: (re: RegExp) => calls.filter((c) => re.test(c.text)),
    get connects() {
      return connects;
    },
    get releases() {
      return releases;
    },
  };
}

export function pgError(code: string, message = "synthetic", extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code, ...extra });
}
