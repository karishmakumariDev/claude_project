
export type Usage = {
  input: number;
  output: number;
};

export type StopReason = "stop" | "length" | "toolUse";

// AI text response
export type TextBlock = {
  type: "text";
  text: string;
};

// AI tool call
export type ToolCallBlock = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

// Assistant response can contain text or tool calls
export type ContentBlock = TextBlock | ToolCallBlock;

// User message
export type UserMessage = {
  role: "user";
  content: string;
};

// AI assistant message
export type AssistantMessage = {
  role: "assistant";
  content: ContentBlock[];
  usage: Usage;
  stopReason: StopReason;
};

// Result returned by an executed tool
export type ToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
};

// All conversation message types
export type Message =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

// Tool information sent to the AI model
export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// Tool with its execution function
export type Tool = ToolSpec & {
  execute(args: Record<string, unknown>): Promise<string>;
};

// Events emitted while streaming an AI response
export type StreamEvent =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "done";
      message: AssistantMessage;
    };

// Options passed to the provider
export type StreamOptions = {
  messages: Message[];
  model: string;
  system?: string;
  tools?: ToolSpec[];
};

// Common interface for AI providers
export interface Provider {
  name: string;
  defaultModel: string;
  stream(opts: StreamOptions): AsyncIterable<StreamEvent>;
}
