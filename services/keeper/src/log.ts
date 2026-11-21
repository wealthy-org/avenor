// Structured, append-only log lines. The ticket's requirement is not "log something" but "a failed
// transaction can be explained from the log alone": every entry carries the block it was decided at,
// the calldata that would have been sent, and — when a submission was skipped — the reason.

export type LogLevel = "info" | "alert" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  job: string;
  blockNumber: string | null;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  txHash?: string;
  calldata?: string;
  nonce?: number;
  detail?: Record<string, string>;
}

export interface Logger {
  write(entry: LogEntry): void;
}

/** JSON lines, one object per line, so `jq` and a log shipper read the same thing. */
export function jsonLogger(sink: { write(chunk: string): unknown } = process.stdout): Logger {
  return {
    write(entry) {
      sink.write(`${JSON.stringify(entry)}\n`);
    },
  };
}

export function memoryLogger(): Logger & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    entries,
    write(entry) {
      entries.push(entry);
    },
  };
}