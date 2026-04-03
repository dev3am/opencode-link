import type { Plugin } from "@opencode-ai/plugin"
import { readConfig } from "./config"
import { splitMessage } from "./splitter"
import { MessageQueue } from "./queue"
import { createProvider } from "./providers"
import type { OpenChannelsConfig, QueuedMessage, PluginState, StreamingState } from "./types"
import type { CommandContext } from "./providers/types"

import { appendFileSync } from "node:fs"
import { join } from "node:path"

const SENSITIVE_KEYS = new Set(["botToken", "appToken", "channelId"])

function maskSensitive(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(maskSensitive)
  const out: any = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "***" : maskSensitive(v)
  }
  return out
}

const _debug = process.env.OPENCODE_LINK_DEBUG === "1"
  ? (dir: string, ...args: any[]) => {
      const ts = new Date().toISOString()
      const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(maskSensitive(a))).join(" ")
      try { appendFileSync(join(dir, ".opencode", "opencode-link-debug.log"), `[${ts}] ${msg}\n`) } catch {}
    }
  : () => {}

const TYPING_INTERVAL_MS = 8000
const STREAM_THROTTLE_MS = 1000
const STREAM_TIMEOUT_MS = 5 * 60 * 1000

async function throttledEdit(
  state: PluginState,
  channelId: string,
  messageId: string,
  streaming: StreamingState,
): Promise<void> {
  const now = Date.now()
  if (now - streaming.lastEditTime < STREAM_THROTTLE_MS) return

  const allText = [...streaming.texts.values()].join("")
  if (!allText) return

  const maxLen = state.provider.streamEditLength
  const display = allText.length > maxLen
    ? allText.slice(0, maxLen) + "\n..."
    : allText

  streaming.lastEditTime = now
  await state.provider.editMessage(channelId, messageId, display)
}

async function selectSession(sdkClient: any, sessionId: string): Promise<boolean> {
  try {
    const res = await sdkClient._client.post({
      url: "/tui/select-session",
      body: { sessionID: sessionId },
      headers: { "content-type": "application/json" },
    })
    return res.data === true
  } catch {
    return false
  }
}

export const openChannels: Plugin = async ({
  client,
  directory,
  serverUrl,
}) => {
  _debug(directory, "plugin loaded")
  _debug(directory, "directory:", directory)

  const config = readConfig(directory)
  _debug(directory, "config:", config)
  if (!config) {
    _debug(directory, "config not found")
    await client.tui.showToast({
      body: {
        message: "opencode-link: Config not found. Run npx opencode-link",
        variant: "warning",
      },
    }).catch(() => {})
    return {}
  }

  const provider = createProvider(config.provider ?? "discord", config)
  _debug(directory, "provider:", config.provider)

  const state: PluginState = {
    sessionMap: new Map(),
    queue: new MessageQueue<QueuedMessage>(),
    provider,
    ready: false,
    streaming: new Map(),
  }

  provider.onMessage((msg) => {
    state.queue.enqueue(msg)
  })

  provider.onCommand(async (ctx: CommandContext) => {
    await handleCommand(ctx, state, client)
  })

  provider.onError((err: Error) => {
    _debug(directory, "provider error:", err.message)
    client.tui.showToast({
      body: {
        message: `opencode-link: Error: ${err.message}`,
        variant: "error",
      },
    }).catch(() => {})
  })

  state.queue.setProcessor((msg) => processMessage(msg, state, client, config))

  _debug(directory, "connecting...")
  provider.connect().then((info) => {
    _debug(directory, "connected:", info.tag)
    state.ready = true

    setTimeout(() => {
      _debug(directory, "showing toast (delayed)")
      client.tui.showToast({
        body: {
          message: `opencode-link: Connected as ${info.tag}`,
          variant: "success",
        },
      }).then(() => _debug(directory, "toast shown OK"))
      .catch((e: any) => _debug(directory, "toast error:", e.message))
    }, 2000)

    const metaNames = new Set(["status", "sessions", "abort", "undo"])
    const metaCommands = [
      { name: "status", description: "Show current session status" },
      { name: "sessions", description: "List all sessions" },
      { name: "abort", description: "Abort current task" },
      { name: "undo", description: "Undo last action" },
    ]

    client.command.list().then((cmdResult) => {
      const opencodeCommands = (cmdResult.data ?? [])
        .filter((cmd: any) => !metaNames.has(cmd.name))
        .map((cmd: any) => ({
          name: cmd.name,
          description: (cmd.description ?? cmd.template ?? "Execute command").slice(0, 100),
        }))
      return provider.registerCommands([...metaCommands, ...opencodeCommands])
    }).catch(() => {
      provider.registerCommands(metaCommands).catch(() => {})
    })
  }).catch((err: any) => {
    _debug(directory, "connect failed:", err.message)
    client.tui.showToast({
      body: {
        message: `opencode-link: Connection failed: ${err.message}`,
        variant: "error",
      },
    }).catch(() => {})
  })

  return {
    event: (input) => handleEvent(input.event, state, config, client),
    "permission.ask": (input, output) =>
      handlePermission(input, output, state, config, client),
  }
}

async function processMessage(
  msg: QueuedMessage,
  state: PluginState,
  sdkClient: any,
  config: OpenChannelsConfig,
): Promise<void> {
  if (!state.ready) return

  const typingInterval = setInterval(() => {
    state.provider.sendTyping(msg.channelId).catch(() => {})
  }, TYPING_INTERVAL_MS)
  state.provider.sendTyping(msg.channelId).catch(() => {})

  try {
    let sessionId = state.sessionMap.get(msg.channelId)

    if (!sessionId) {
      const result = await sdkClient.session.create({})
      if (!result.data) throw new Error("Failed to create session")
      sessionId = result.data.id as string
      state.sessionMap.set(msg.channelId, sessionId!)
    }

    await selectSession(sdkClient, sessionId)

    const placeholderId = await state.provider.sendMessage(msg.channelId, "\u{1F914} *(thinking...)*")

    const streamingState: StreamingState = {
      sessionId,
      channelId: msg.channelId,
      messageId: placeholderId,
      texts: new Map(),
      partTypes: new Map(),
      lastEditTime: 0,
      resolve: null,
      fromOpencode: false,
    }

    const streamingPromise = new Promise<void>((resolve) => {
      streamingState.resolve = resolve
    })

    state.streaming.set(sessionId, streamingState)

    const timeout = setTimeout(() => {
      if (streamingState.resolve) {
        streamingState.resolve()
        streamingState.resolve = null
      }
    }, STREAM_TIMEOUT_MS)

    const parts: Array<{ type: "text"; text: string }> = [
      { type: "text", text: msg.content },
    ]

    for (const attachment of msg.attachments ?? []) {
      parts.push({
        type: "text",
        text: `[Attachment: ${attachment.name}](${attachment.url})`,
      })
    }

    try {
      await sdkClient.session.promptAsync({
        body: { parts },
        path: { id: sessionId },
      })
    } catch (promptErr: any) {
      clearTimeout(timeout)
      state.streaming.delete(sessionId)
      await state.provider
        .editMessage(msg.channelId, placeholderId, `**Error:** ${promptErr.message ?? String(promptErr)}`)
      return
    }

    await streamingPromise
    clearTimeout(timeout)

    const allText = [...streamingState.texts.values()].join("")
    state.streaming.delete(sessionId)

    if (!allText) {
      await state.provider.editMessage(msg.channelId, placeholderId, "*(no text response)*")
      return
    }

    const chunks = splitMessage(allText, state.provider.maxMessageLength)
    await state.provider.editMessage(msg.channelId, placeholderId, chunks[0])
    for (let i = 1; i < chunks.length; i++) {
      await state.provider.sendMessage(msg.channelId, chunks[i])
    }
  } catch (err: any) {
    await state.provider.sendMessage(msg.channelId, `**Error:** ${err.message ?? String(err)}`).catch(() => {})
  } finally {
    clearInterval(typingInterval)
  }
}

async function handleEvent(
  event: any,
  state: PluginState,
  config: OpenChannelsConfig,
  sdkClient: any,
): Promise<void> {
  if (event.type === "message.part.delta") {
    const props = event.properties
    if (!props) return
    const sessionId: string | undefined = props.sessionID
    if (!sessionId) return

    const streaming = state.streaming.get(sessionId)
    if (!streaming) return

    const partID: string | undefined = props.partID
    const field: string | undefined = props.field
    const delta: string | undefined = props.delta
    if (!partID || field !== "text" || !delta) return

    if (streaming.partTypes.get(partID) !== "text") return

    const current = streaming.texts.get(partID) ?? ""
    streaming.texts.set(partID, current + delta)

    if (streaming.messageId) {
      await throttledEdit(state, streaming.channelId, streaming.messageId, streaming)
    }
    return
  }

  if (event.type === "message.part.updated") {
    const part = event.properties?.part
    if (!part) return

    const sessionId: string | undefined = event.properties?.sessionID
    if (!sessionId) return

    let streaming = state.streaming.get(sessionId)

    if (!streaming) {
      if (part.type !== "text" || !part.text) return

      let channelId: string | null = null
      for (const [chId, sid] of state.sessionMap) {
        if (sid === sessionId) { channelId = chId; break }
      }
      if (!channelId) return

      await state.provider.sendMessage(channelId, `> ${part.text}`)
      const placeholderId = await state.provider.sendMessage(channelId, "\u{1F914} *(thinking...)*")

      streaming = {
        sessionId,
        channelId,
        messageId: placeholderId,
        texts: new Map(),
        partTypes: new Map(),
        lastEditTime: 0,
        resolve: null,
        fromOpencode: true,
      }
      state.streaming.set(sessionId, streaming)
      return
    }

    streaming.partTypes.set(part.id, part.type)

    if (part.type === "text" && part.text && streaming.texts.has(part.id)) {
      streaming.texts.set(part.id, part.text)
    }

    if (streaming.messageId) {
      await throttledEdit(state, streaming.channelId, streaming.messageId, streaming)
    }
    return
  }

  if (event.type === "session.idle") {
    const sessionId: string | undefined = event.properties?.sessionID
    if (!sessionId) return

    const streaming = state.streaming.get(sessionId)
    if (!streaming) return

    if (streaming.fromOpencode) {
      state.streaming.delete(sessionId)
      const allText = [...streaming.texts.values()].join("")
      if (streaming.messageId) {
        if (!allText) {
          await state.provider.editMessage(streaming.channelId, streaming.messageId, "*(no text response)*")
        } else {
          const chunks = splitMessage(allText, state.provider.maxMessageLength)
          await state.provider.editMessage(streaming.channelId, streaming.messageId, chunks[0])
          for (let i = 1; i < chunks.length; i++) {
            await state.provider.sendMessage(streaming.channelId, chunks[i])
          }
        }
      }
      return
    }

    if (streaming.resolve) {
      streaming.resolve()
      streaming.resolve = null
    }
    return
  }

  if (event.type === "session.error") {
    const sessionId = event.properties?.sessionID
    const errorMsg =
      event.properties?.error?.data?.message ??
      event.properties?.error?.message ??
      "Unknown error"

    if (sessionId && state.streaming.has(sessionId)) {
      const streaming = state.streaming.get(sessionId)!
      if (streaming.resolve) {
        streaming.resolve()
        streaming.resolve = null
      }
      if (streaming.messageId) {
        await state.provider.editMessage(streaming.channelId, streaming.messageId, `**Error:** ${errorMsg}`)
      }
      state.streaming.delete(sessionId)
    }

    await state.provider.sendMessage(config.channelId, `**Session Error:** ${errorMsg}`).catch(() => {})

    if (sessionId) {
      for (const [chId, sid] of state.sessionMap) {
        if (sid === sessionId) {
          state.sessionMap.delete(chId)
          break
        }
      }
    }
  }
}

async function handlePermission(
  input: any,
  output: { status: "ask" | "deny" | "allow" },
  state: PluginState,
  config: OpenChannelsConfig,
  sdkClient: any,
): Promise<void> {
  if (!state.ready) {
    output.status = "deny"
    return
  }

  try {
    const response = await state.provider.showPermission({
      id: input.id,
      sessionId: input.sessionID,
      title: input.title ?? "Unknown",
    })

    await sdkClient.postSessionIdPermissionsPermissionId({
      path: { id: input.sessionID, permissionID: input.id },
      body: { response },
    })
    output.status = response === "reject" ? "deny" : "allow"
  } catch {
    output.status = "deny"
  }
}

async function handleCommand(
  ctx: CommandContext,
  state: PluginState,
  sdkClient: any,
): Promise<void> {
  if (!state.ready) return

  try {
    switch (ctx.commandName) {
      case "status": {
        const result = await sdkClient.session.list()
        const sessions = result.data ?? []
        const activeSessionId = [...state.sessionMap.values()].pop()
        if (activeSessionId) {
          const session = sessions.find((s: any) => s.id === activeSessionId)
          await ctx.reply(`Active session: \`${activeSessionId}\` — ${session?.title ?? "untitled"}`)
        } else {
          await ctx.reply("No active session.")
        }
        break
      }

      case "sessions": {
        const result = await sdkClient.session.list()
        const sessions = result.data ?? []
        if (sessions.length === 0) {
          await ctx.reply("No sessions.")
          break
        }
        const lines = sessions.slice(0, 10).map((s: any) =>
          `- \`${s.id}\` ${s.title ?? "untitled"}`
        )
        await ctx.reply(lines.join("\n"))
        break
      }

      case "abort": {
        const activeSessionId = [...state.sessionMap.values()].pop()
        if (activeSessionId) {
          await sdkClient.session.abort({ path: { id: activeSessionId } })
          await ctx.reply("Aborted.")
        } else {
          await ctx.reply("No active session to abort.")
        }
        break
      }

      case "undo": {
        const activeSessionId = [...state.sessionMap.values()].pop()
        if (activeSessionId) {
          await sdkClient.session.revert({ path: { id: activeSessionId } })
          await ctx.reply("Undone.")
        } else {
          await ctx.reply("No active session to undo.")
        }
        break
      }

      default: {
        const activeSessionId = [...state.sessionMap.values()].pop()
        if (!activeSessionId) {
          await ctx.reply("No active session. Send a message first to create one.")
          break
        }

        const result = await sdkClient.session.command({
          path: { id: activeSessionId },
          body: { command: ctx.commandName, arguments: ctx.input },
        })

        if (result.data) {
          const textParts = (result.data.parts ?? [])
            .filter((p: any) => p.type === "text" && p.text)
            .map((p: any) => p.text as string)
          const fullText = textParts.join("\n")
          if (fullText) {
            const chunks = splitMessage(fullText, state.provider.maxMessageLength)
            await ctx.reply(chunks[0])
            for (let i = 1; i < chunks.length; i++) {
              await ctx.followUp(chunks[i])
            }
          } else {
            await ctx.reply("*(command completed)*")
          }
        } else {
          await ctx.reply("*(no response)*")
        }
        break
      }
    }
  } catch (err: any) {
    await ctx.reply(`Error: ${err.message ?? String(err)}`)
  }
}

export default {
  id: "opencode-link",
  server: openChannels,
}
