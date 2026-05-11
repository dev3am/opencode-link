import type { ChannelProvider } from "./providers/types";

export interface OpenChannelsConfig {
  provider?: "discord" | "slack" | "telegram";
  botToken: string;
  appToken?: string;
  channelId: string;
}

export interface QueuedMessage {
  content: string;
  channelId: string;
  messageId: string;
  attachments?: Array<{ url: string; name: string }>;
}

export interface StreamingState {
  sessionId: string;
  channelId: string;
  messageId: string | null;
  texts: Map<string, string>;
  partTypes: Map<string, string>;
  lastEditTime: number;
  resolve: (() => void) | null;
  fromOpencode: boolean;
}

export interface PluginState {
  sessionMap: Map<string, string>;
  queue: import("./queue").MessageQueue<QueuedMessage>;
  provider: ChannelProvider;
  ready: boolean;
  streaming: Map<string, StreamingState>;
}
