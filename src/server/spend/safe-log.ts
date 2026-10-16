import { LOG_EVENTS, type Logger } from "@/app/api/_shared/log";

// The emergency sink must preserve the shared logger's UUID/phone protection.
const RESERVATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHONE_LIKE = /01[0-9]{9}/;

// A broken sink must never change a paid call's outcome, skip a ROLLBACK or discard paid output.
export function safeLogger(logger: Logger): Logger {
  const guard = (level: keyof Logger): Logger[keyof Logger] => (entry) => {
    try {
      logger[level](entry);
    } catch {
      try {
        const fallback: { event: string; failed_event?: string; reservation_id?: string } = {
          event: "spend.log_failed",
        };
        if (entry && LOG_EVENTS.includes(entry.event)) {
          fallback.failed_event = entry.event;
        }
        if (entry && typeof entry.reservation_id === "string"
          && RESERVATION_UUID.test(entry.reservation_id) && !PHONE_LIKE.test(entry.reservation_id)) {
          fallback.reservation_id = entry.reservation_id;
        }
        console.error(JSON.stringify(fallback));
      } catch {
        /* logging is best effort */
      }
    }
  };
  return { info: guard("info"), warn: guard("warn"), error: guard("error") };
}
