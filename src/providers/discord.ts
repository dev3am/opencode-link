import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ChannelProvider,
  CommandContext,
  IncomingMessage,
  PermissionRequest,
  PermissionResponse,
  ProviderInfo,
} from "./types";

type SendableChannel = Extract<
  Awaited<ReturnType<Client<true>["channels"]["fetch"]>>,
  { send: unknown; sendTyping: unknown }
>;

export class DiscordProvider implements ChannelProvider {
  ready = false;
  maxMessageLength = 2000;
  streamEditLength = 1900;

  private client: Client<true> = null as unknown as Client<true>;
  private token: string;
  private channelId: string;
  private messageHandler?: (msg: IncomingMessage) => void;
  private commandHandler?: (ctx: CommandContext) => Promise<void>;
  private errorHandler?: (error: Error) => void;

  constructor(config: { botToken: string; channelId: string }) {
    this.token = config.botToken;
    this.channelId = config.channelId;
  }

  async connect(): Promise<ProviderInfo> {
    const discord = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });
    this.client = discord as Client<true>;

    return new Promise((resolve, reject) => {
      discord.once("clientReady", (d) => {
        this.ready = true;
        resolve({ tag: d.user.tag });
      });

      discord.on("messageCreate", (msg) => {
        if (msg.author.bot) return;
        if (msg.channelId !== this.channelId) return;
        if (!this.messageHandler) return;

        this.messageHandler({
          content: msg.content,
          channelId: msg.channelId,
          messageId: msg.id,
          attachments: msg.attachments.map((a) => ({
            url: a.url,
            name: a.name ?? "file",
          })),
        });
      });

      discord.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (!this.commandHandler) return;

        const ctx: CommandContext = {
          commandName: interaction.commandName,
          input: interaction.options.getString("input") ?? "",
          reply: async (text: string) => {
            if (interaction.deferred) {
              await interaction.editReply(text);
            } else {
              await interaction.reply({ content: text });
            }
          },
          followUp: async (text: string) => {
            await interaction.followUp(text);
          },
        };

        await interaction.deferReply();
        await this.commandHandler(ctx);
      });

      discord.on("error", (err: Error) => {
        this.errorHandler?.(err);
        reject(err);
      });

      discord.login(this.token).catch(reject);
    });
  }

  destroy(): void {
    this.client?.destroy();
  }

  async sendMessage(channelId: string, text: string): Promise<string> {
    const ch = await this.fetchSendable(channelId);
    const msg = await ch.send(text);
    return msg.id;
  }

  async editMessage(channelId: string, messageId: string, text: string): Promise<void> {
    const ch = await this.fetchSendable(channelId);
    await ch.messages.edit(messageId, text).catch(() => {});
  }

  async sendTyping(channelId: string): Promise<void> {
    const ch = await this.fetchSendable(channelId);
    await ch.sendTyping().catch(() => {});
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  onCommand(handler: (ctx: CommandContext) => Promise<void>): void {
    this.commandHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  async registerCommands(commands: Array<{ name: string; description: string }>): Promise<void> {
    if (!this.client) return;

    const rest = new REST({ version: "10" }).setToken(this.token);
    const slashCommands = commands.map((cmd) =>
      new SlashCommandBuilder().setName(cmd.name).setDescription(cmd.description.slice(0, 100)).toJSON(),
    );

    const channel = await this.client.channels.fetch(this.channelId);
    const guildId = channel && "guildId" in channel ? (channel as any).guildId : null;

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), {
        body: slashCommands,
      });
    } else {
      await rest.put(Routes.applicationCommands(this.client.user.id), {
        body: slashCommands,
      });
    }
  }

  async showPermission(request: PermissionRequest): Promise<PermissionResponse> {
    const channel = await this.fetchSendable(this.channelId);

    const accept = new ButtonBuilder()
      .setCustomId(`perm:${request.id}:once`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Primary);

    const acceptAlways = new ButtonBuilder()
      .setCustomId(`perm:${request.id}:always`)
      .setLabel("Accept Always")
      .setStyle(ButtonStyle.Success);

    const deny = new ButtonBuilder()
      .setCustomId(`perm:${request.id}:reject`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(accept, acceptAlways, deny);

    const permMsg = await channel.send({
      content: `**Permission Request:** ${request.title ?? "Unknown"}`,
      components: [row],
    });

    return new Promise((resolve) => {
      const collector = permMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 });

      collector.on("collect", async (interaction: any) => {
        const [, , response] = interaction.customId.split(":");
        await interaction.update({
          content: `**Permission:** ${response === "reject" ? "Denied" : "Accepted"}`,
          components: [],
        });
        collector.stop();
        resolve(response === "reject" ? "reject" : response === "always" ? "always" : "once");
      });

      collector.on("end", async (_: any, reason: string) => {
        if (reason === "time") {
          await permMsg.edit({ content: "**Permission:** Timed out (denied)", components: [] }).catch(() => {});
          resolve("reject");
        }
      });
    });
  }

  private async fetchSendable(channelId: string): Promise<SendableChannel> {
    const ch = await this.client.channels.fetch(channelId);
    if (!ch || !("send" in ch && "sendTyping" in ch)) {
      throw new Error(`Channel ${channelId} not found or not sendable`);
    }
    return ch as SendableChannel;
  }
}
