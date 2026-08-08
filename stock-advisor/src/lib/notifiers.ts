import { chunkMessage } from "./notifications";

export interface Notifier {
  name: string;
  isConfigured(): boolean;
  send(message: string): Promise<void>;
}

/** Discord caps webhook `content` at 2000 characters. */
const DISCORD_LIMIT = 2000;

export const discordNotifier: Notifier = {
  name: "Discord",
  isConfigured: () => !!process.env.DISCORD_WEBHOOK_URL,
  async send(message) {
    const url = process.env.DISCORD_WEBHOOK_URL!;
    for (const content of chunkMessage(message, DISCORD_LIMIT)) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
  },
};

/**
 * LINE Messaging API push.
 *
 * LINE Notify — the token-and-curl service this would once have used — was shut
 * down on 2025-03-31, so pushing through a Messaging API channel is the
 * remaining option. It needs a channel access token and the recipient's user ID.
 */
const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_TEXT_LIMIT = 5000;
/** The push endpoint accepts at most 5 message objects per request. */
const LINE_MESSAGES_PER_REQUEST = 5;

export const lineNotifier: Notifier = {
  name: "LINE",
  isConfigured: () => !!process.env.LINE_CHANNEL_ACCESS_TOKEN && !!process.env.LINE_TO,
  async send(message) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
    const to = process.env.LINE_TO!;
    const parts = chunkMessage(message, LINE_TEXT_LIMIT);

    for (let i = 0; i < parts.length; i += LINE_MESSAGES_PER_REQUEST) {
      const messages = parts.slice(i, i + LINE_MESSAGES_PER_REQUEST).map((text) => ({ type: "text", text }));
      const res = await fetch(LINE_PUSH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to, messages }),
      });
      if (!res.ok) throw new Error(`LINE push returned ${res.status}: ${await res.text()}`);
    }
  },
};

export const notifiers: Notifier[] = [discordNotifier, lineNotifier];
