import { Bot, InlineKeyboard } from "grammy"
import type {
  ChannelProvider,
  IncomingMessage,
  CommandContext,
  PermissionRequest,
  PermissionResponse,
  ProviderInfo,
} from "./types"

export class TelegramProvider implements ChannelProvider {
  ready = false
  maxMessageLength = 4096
  streamEditLength = 4000

  private bot: Bot | null = null
  private token: string
  private chatId: string
  private messageHandler?: (msg: IncomingMessage) => void
  private commandHandler?: (ctx: CommandContext) => Promise<void>
  private errorHandler?: (error: Error) => void
  private permissionResolvers: Map<string, (response: PermissionResponse) => void> = new Map()
  private permissionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(config: { botToken: string; channelId: string }) {
    this.token = config.botToken
    this.chatId = config.channelId
  }

  async connect(): Promise<ProviderInfo> {
    const bot = new Bot(this.token, { client: { fetch } })
    this.bot = bot

    const me = await bot.api.getMe()

    bot.on("message:text", async (ctx) => {
      if (!this.messageHandler) return
      if (ctx.from?.is_bot) return
      const chatId = String(ctx.chat.id)
      if (chatId !== this.chatId) return

      this.messageHandler({
        content: ctx.message.text,
        channelId: chatId,
        messageId: String(ctx.message.message_id),
        attachments: [],
      })
    })

    bot.on("message:document", async (ctx) => {
      if (!this.messageHandler) return
      if (ctx.from?.is_bot) return
      const chatId = String(ctx.chat.id)
      if (chatId !== this.chatId) return

      const doc = ctx.message.document
      let attachments: Array<{ url: string; name: string }> = []
      if (doc) {
        try {
          const file = await this.bot!.api.getFile(doc.file_id)
          attachments = [{ url: `https://api.telegram.org/file/bot${this.token}/${file.file_path}`, name: doc.file_name ?? "file" }]
        } catch { }
      }
      this.messageHandler({
        content: ctx.message.caption ?? ctx.message.text ?? "",
        channelId: chatId,
        messageId: String(ctx.message.message_id),
        attachments,
      })
    })

    bot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data
      if (!data.startsWith("perm:")) return

      const [, permId, response] = data.split(":")
      await ctx.answerCallbackQuery()

      const text = response === "reject" ? "Permission: Denied" : "Permission: Accepted"
      await ctx.editMessageText(text).catch(() => { })

      const timer = this.permissionTimers.get(permId)
      if (timer) {
        clearTimeout(timer)
        this.permissionTimers.delete(permId)
      }

      const resolve = this.permissionResolvers.get(permId)
      if (resolve) {
        this.permissionResolvers.delete(permId)
        resolve(response === "reject" ? "reject" : response === "always" ? "always" : "once")
      }
    })

    bot.catch((error) => {
      this.errorHandler?.(error)
    })

    bot.start({
      onStart: () => {
        this.ready = true
      },
    }).catch((err) => {
      this.errorHandler?.(err)
    })

    return { tag: `@${me.username}` }
  }

  destroy(): void {
    for (const timer of this.permissionTimers.values()) {
      clearTimeout(timer)
    }
    this.permissionTimers.clear()
    this.permissionResolvers.clear()
    this.bot?.stop()
  }

  async sendMessage(channelId: string, text: string): Promise<string> {
    const result = await this.bot!.api.sendMessage(Number(channelId), text)
    return String(result.message_id)
  }

  async editMessage(channelId: string, messageId: string, text: string): Promise<void> {
    await this.bot!.api.editMessageText(Number(channelId), Number(messageId), text).catch(() => { })
  }

  async sendTyping(channelId: string): Promise<void> {
    await this.bot!.api.sendChatAction(Number(channelId), "typing").catch(() => { })
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler
  }

  onCommand(handler: (ctx: CommandContext) => Promise<void>): void {
    this.commandHandler = handler
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler
  }

  async registerCommands(commands: Array<{ name: string; description: string }>): Promise<void> {
    if (!this.bot) return

    await this.bot.api.setMyCommands(
      commands.map((cmd) => ({
        command: cmd.name,
        description: cmd.description.slice(0, 256),
      }))
    )

    for (const cmd of commands) {
      const commandName = cmd.name
      this.bot.command(commandName, async (ctx) => {
        if (!this.commandHandler) return
        const chatId = String(ctx.chat.id)
        if (chatId !== this.chatId) return

        const input = ctx.message?.text
          ? ctx.message.text.slice(`/${commandName}`.length).replace(/^@\S+\s*/, "").trim()
          : ""

        const cmdCtx: CommandContext = {
          commandName,
          input,
          reply: async (text: string) => {
            await ctx.reply(text)
          },
          followUp: async (text: string) => {
            await ctx.reply(text)
          },
        }

        await this.commandHandler(cmdCtx)
      })
    }
  }

  async showPermission(request: PermissionRequest): Promise<PermissionResponse> {
    const keyboard = new InlineKeyboard()
      .text("Accept", `perm:${request.id}:once`)
      .text("Accept Always", `perm:${request.id}:always`)
      .text("Deny", `perm:${request.id}:reject`)

    const msg = await this.bot!.api.sendMessage(
      Number(this.chatId),
      `Permission Request: ${request.title ?? "Unknown"}`,
      { reply_markup: keyboard },
    )

    return new Promise((resolve) => {
      this.permissionResolvers.set(request.id, resolve)

      const timer = setTimeout(async () => {
        this.permissionResolvers.delete(request.id)
        this.permissionTimers.delete(request.id)
        await this.bot!.api.editMessageText(
          Number(this.chatId),
          msg.message_id,
          "Permission: Timed out (denied)",
        ).catch(() => { })
        resolve("reject")
      }, 5 * 60 * 1000)

      this.permissionTimers.set(request.id, timer)
    })
  }
}
