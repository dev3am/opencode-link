export interface IncomingMessage {
  content: string;
  channelId: string;
  messageId: string;
  attachments?: Array<{ url: string; name: string }>;
}

export interface CommandContext {
  commandName: string;
  input: string;
  reply(text: string): Promise<void>;
  followUp(text: string): Promise<void>;
}

export interface PermissionRequest {
  id: string;
  sessionId: string;
  title: string;
}

export type PermissionResponse = "once" | "always" | "reject";

export interface ProviderInfo {
  tag: string;
}

export interface ChannelProvider {
  ready: boolean;
  maxMessageLength: number;
  streamEditLength: number;

  connect(): Promise<ProviderInfo>;
  destroy(): void;

  sendMessage(channelId: string, text: string): Promise<string>;
  editMessage(channelId: string, messageId: string, text: string): Promise<void>;
  sendTyping(channelId: string): Promise<void>;

  onMessage(handler: (msg: IncomingMessage) => void): void;
  onCommand(handler: (ctx: CommandContext) => Promise<void>): void;
  onError(handler: (error: Error) => void): void;

  registerCommands(commands: Array<{ name: string; description: string }>): Promise<void>;
  showPermission(request: PermissionRequest): Promise<PermissionResponse>;
}
