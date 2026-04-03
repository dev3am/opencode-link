import type { ChannelProvider } from "./types"
import { DiscordProvider } from "./discord"
import { SlackProvider } from "./slack"
import { TelegramProvider } from "./telegram"

export type {
  ChannelProvider,
  IncomingMessage,
  CommandContext,
  PermissionRequest,
  PermissionResponse,
  ProviderInfo,
} from "./types"

export function createProvider(
  providerName: string,
  config: Record<string, any>,
): ChannelProvider {
  switch (providerName) {
    case "discord":
    case undefined:
      return new DiscordProvider({ botToken: config.botToken, channelId: config.channelId })
    case "slack":
      return new SlackProvider({
        botToken: config.botToken,
        appToken: config.appToken ?? "",
        channelId: config.channelId,
      })
    case "telegram":
      return new TelegramProvider({
        botToken: config.botToken,
        channelId: config.channelId,
      })
    default:
      throw new Error(`Unknown provider: ${providerName}`)
  }
}
