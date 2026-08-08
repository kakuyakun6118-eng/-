import { loadRecommendations } from "./recommendations";
import { loadHoldingVerdicts } from "./holdingsService";
import { buildNotifications, renderMessage, type Notification } from "./notifications";
import { notifiers } from "./notifiers";
import { isOnCooldown, loadNotifyLog, recordSends, saveNotifyLog } from "./notifyStore";

export interface NotifyResult {
  candidates: number;
  sent: number;
  skippedOnCooldown: number;
  channels: { name: string; status: "sent" | "not-configured" | "failed"; error?: string }[];
  notifications: Notification[];
}

/**
 * Evaluate today's alerts and push them to whichever channels are configured.
 * Safe to run on a short cron: anything already sent stays on cooldown.
 */
export async function runNotify(dryRun = false): Promise<NotifyResult> {
  const [recommendations, verdicts] = await Promise.all([loadRecommendations(), loadHoldingVerdicts()]);

  const candidates = buildNotifications(recommendations, verdicts);
  const now = Date.now();
  const log = await loadNotifyLog();
  const due = candidates.filter((n) => !isOnCooldown(log, n.dedupeKey, now));

  const result: NotifyResult = {
    candidates: candidates.length,
    sent: 0,
    skippedOnCooldown: candidates.length - due.length,
    channels: [],
    notifications: due,
  };

  if (due.length === 0) return result;

  const message = renderMessage(due);
  let anyDelivered = false;

  for (const notifier of notifiers) {
    if (!notifier.isConfigured()) {
      result.channels.push({ name: notifier.name, status: "not-configured" });
      continue;
    }
    if (dryRun) {
      result.channels.push({ name: notifier.name, status: "sent" });
      anyDelivered = true;
      continue;
    }
    try {
      await notifier.send(message);
      result.channels.push({ name: notifier.name, status: "sent" });
      anyDelivered = true;
    } catch (err) {
      console.error(`[notify] ${notifier.name} delivery failed`, err);
      result.channels.push({ name: notifier.name, status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Only start the cooldown once something actually went out, so a channel
  // outage doesn't silently swallow the alert.
  if (anyDelivered && !dryRun) {
    await saveNotifyLog(recordSends(log, due.map((n) => n.dedupeKey), now));
    result.sent = due.length;
  }

  return result;
}
