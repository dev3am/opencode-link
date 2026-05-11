import { App, LogLevel } from "@slack/bolt";
import type {
  ChannelProvider,
  CommandContext,
  IncomingMessage,
  PermissionRequest,
  PermissionResponse,
  ProviderInfo,
} from "./types";

export class SlackProvider implements ChannelProvider {
  ready = false;
  maxMessageLength = 40000;
  streamEditLength = 39000;

  private app: App | null = null;
  private botToken: string;
  private appToken: string;
  private channelId: string;
  private messageHandler?: (msg: IncomingMessage) => void;
  private commandHandler?: (ctx: CommandContext) => Promise<void>;
  private errorHandler?: (error: Error) => void;
  private permissionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private permissionResolvers: Map<string, (response: PermissionResponse) => void> = new Map();

  constructor(config: { botToken: string; appToken: string; channelId: string }) {
    this.botToken = config.botToken;
    this.appToken = config.appToken;
    this.channelId = config.channelId;
  }

  async connect(): Promise<ProviderInfo> {
    const app = new App({
      token: this.botToken,
      socketMode: true,
      appToken: this.appToken,
      logLevel: LogLevel.ERROR,
    });
    this.app = app;

    let botUserId: string | null = null;

    try {
      const authResult = await app.client.auth.test();
      botUserId = authResult.user_id ?? null;
    } catch {}

    app.event("message", async ({ message }) => {
      if (!this.messageHandler) return;
      if (message.subtype) return;
      if ((message as any).bot_id) return;
      if (message.channel !== this.channelId) return;

      const files = (message as any).files as Array<{ url_private: string; name: string }> | undefined;

      this.messageHandler({
        content: (message as any).text ?? "",
        channelId: message.channel,
        messageId: (message as any).ts ?? String(Date.now()),
        attachments: files?.map((f) => ({
          url: f.url_private ?? "",
          name: f.name ?? "file",
        })),
      });
    });

    app.command("/opencode", async ({ command, ack, respond }) => {
      await ack();
      if (!this.commandHandler) return;

      const parts = command.text.trim().split(/\s+/);
      const commandName = parts[0] || "status";
      const input = parts.slice(1).join(" ");

      const ctx: CommandContext = {
        commandName,
        input,
        reply: async (text: string) => {
          await respond({ text, response_type: "in_channel" });
        },
        followUp: async (text: string) => {
          await respond({ text });
        },
      };

      await this.commandHandler(ctx);
    });

    app.action(/^perm:/, async ({ ack, body, respond }) => {
      await ack();
      if (body.type !== "block_actions") return;
      const action = body.actions[0];
      if (!action) return;

      const [, permId, response] = action.action_id.split(":");

      await respond({
        text: `*Permission:* ${response === "reject" ? "Denied" : "Accepted"}`,
        replace_original: true,
      });

      const timer = this.permissionTimers.get(permId);
      if (timer) {
        clearTimeout(timer);
        this.permissionTimers.delete(permId);
      }

      const resolve = this.permissionResolvers.get(permId);
      if (resolve) {
        this.permissionResolvers.delete(permId);
        resolve(response === "reject" ? "reject" : response === "always" ? "always" : "once");
      }
    });

    app.error(async (error) => {
      this.errorHandler?.(error);
    });

    await app.start();
    this.ready = true;

    return { tag: botUserId ? `<@${botUserId}>` : "slack-bot" };
  }

  destroy(): void {
    for (const timer of this.permissionTimers.values()) {
      clearTimeout(timer);
    }
    this.permissionTimers.clear();
    this.permissionResolvers.clear();
    this.app?.stop();
  }

  async sendMessage(channelId: string, text: string): Promise<string> {
    const result = await this.app?.client.chat.postMessage({
      channel: channelId,
      text,
    });
    return String(result?.ts ?? "");
  }

  async editMessage(channelId: string, messageId: string, text: string): Promise<void> {
    await this.app?.client.chat
      .update({
        channel: channelId,
        ts: messageId,
        text,
      })
      .catch(() => {});
  }

  async sendTyping(_channelId: string): Promise<void> {}

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  onCommand(handler: (ctx: CommandContext) => Promise<void>): void {
    this.commandHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  async registerCommands(_commands: Array<{ name: string; description: string }>): Promise<void> {}

  async showPermission(request: PermissionRequest): Promise<PermissionResponse> {
    const result = await this.app?.client.chat.postMessage({
      channel: this.channelId,
      text: `*Permission Request:* ${request.title ?? "Unknown"}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Permission Request:* ${request.title ?? "Unknown"}` },
        },
        {
          type: "actions",
          block_id: `perm_actions:${request.id}`,
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Accept" },
              action_id: `perm:${request.id}:once`,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Accept Always" },
              action_id: `perm:${request.id}:always`,
              style: "primary",
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Deny" },
              action_id: `perm:${request.id}:reject`,
              style: "danger",
            },
          ],
        },
      ],
    });

    return new Promise((resolve) => {
      this.permissionResolvers.set(request.id, resolve);

      const timer = setTimeout(
        () => {
          this.permissionResolvers.delete(request.id);
          this.permissionTimers.delete(request.id);
          this.app?.client.chat
            .update({
              channel: this.channelId,
              ts: String(result?.ts ?? ""),
              text: "*Permission:* Timed out (denied)",
              blocks: [],
            })
            .catch(() => {});
          resolve("reject");
        },
        5 * 60 * 1000,
      );

      this.permissionTimers.set(request.id, timer);
    });
  }
}
