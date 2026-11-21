// Alert delivery. The production channel is a webhook (Slack-compatible `{text}` plus the full
// payload), which means delivery can be proven by a real HTTP round trip in the test instead of by
// "the function was called".

import type { Alert } from "./monitor.ts";

export interface Notifier {
  send(alerts: Alert[], context: { blockNumber: string; blockTimestamp: string }): Promise<void>;
}

export class WebhookError extends Error {}

export function webhookNotifier(options: {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Notifier {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async send(alerts, context) {
      if (alerts.length === 0) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(options.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: alerts.map((alert) => `[${alert.severity}] ${alert.code}: ${alert.message}`).join("\n"),
            blockNumber: context.blockNumber,
            blockTimestamp: context.blockTimestamp,
            alerts,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new WebhookError(`webhook answered ${response.status}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}