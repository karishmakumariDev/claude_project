import type {
  Provider,
  StreamOptions,
  StopReason,
  Usage,
  ContentBlock,
  ToolCallBlock,
} from "../types.ts";

type OllamaToolCall = {
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

type OllamaChunk = {
  error?: string;
  message?: {
    content?: string | null;
    tool_calls?: OllamaToolCall[];
  };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  done_reason?: string;
};

export function createOllama(): Provider {
  return {
    name: "ollama",
    defaultModel: "llama3.2:1b",

    async *stream({
      messages,
      model,
      system,
      tools,
    }: StreamOptions) {
      const systemPrompt = system ?? `
You are a helpful AI coding assistant.

Rules:
- Answer general knowledge questions directly in plain text.
- For greetings, respond naturally.
- Do not call tools for ordinary questions.
- Use tools only when the user requests an action involving project files.
- Use stat only to inspect file or directory metadata.
- Never print tool definitions or schemas as your answer.
- Do not invent tool results.
`;

      const ollamaMessages = [
        {
          role: "system",
          content: systemPrompt,
        },

        ...messages.map((message) => {
          if (message.role === "user") {
            return {
              role: "user" as const,
              content: message.content,
            };
          }

          if (message.role === "assistant") {
            const text = message.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("");

            const toolCalls = message.content
              .filter(
                (block): block is ToolCallBlock =>
                  block.type === "toolCall"
              )
              .map((call) => ({
                function: {
                  name: call.name,
                  arguments: call.arguments,
                },
              }));

            return {
              role: "assistant" as const,
              content: text,
              ...(toolCalls.length > 0
                ? { tool_calls: toolCalls }
                : {}),
            };
          }

          return {
            role: "tool" as const,
            content: message.content,
          };
        }),
      ];

      const ollamaTools = (tools ?? []).map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      const response = await fetch(
        "http://localhost:11434/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: ollamaMessages,
            ...(ollamaTools.length > 0
              ? { tools: ollamaTools }
              : {}),
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Ollama error ${response.status}: ${await response.text()}`
        );
      }

      if (!response.body) {
        throw new Error("Ollama returned an empty response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let text = "";
      let usage: Usage = {
        input: 0,
        output: 0,
      };
      let stopReason: StopReason = "stop";

      const toolCalls = new Map<
        number,
        { name: string; arguments: Record<string, unknown> }
      >();

      const processData = (data: OllamaChunk): string => {
        if (data.error) {
          throw new Error(data.error);
        }

        if (data.prompt_eval_count !== undefined) {
          usage.input = data.prompt_eval_count;
        }

        if (data.eval_count !== undefined) {
          usage.output = data.eval_count;
        }

        for (const [index, call] of (
          data.message?.tool_calls ?? []
        ).entries()) {
          const name = call.function?.name;

          if (!name) continue;

          const rawArgs = call.function?.arguments;
          let parsedArgs: Record<string, unknown> = {};

          if (
            rawArgs !== null &&
            typeof rawArgs === "object" &&
            !Array.isArray(rawArgs)
          ) {
            parsedArgs = rawArgs as Record<string, unknown>;
          } else if (typeof rawArgs === "string") {
            try {
              const parsed: unknown = JSON.parse(rawArgs);

              if (
                parsed !== null &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
              ) {
                parsedArgs = parsed as Record<string, unknown>;
              }
            } catch {
              parsedArgs = {};
            }
          }

          toolCalls.set(index, {
            name,
            arguments: parsedArgs,
          });
        }

        if (data.done && data.done_reason === "length") {
          stopReason = "length";
        }

        return data.message?.content ?? "";
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, {
            stream: true,
          });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const data = JSON.parse(line) as OllamaChunk;
            const delta = processData(data);

            if (delta) {
              text += delta;
              yield {
                type: "text_delta",
                delta,
              };
            }
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          const data = JSON.parse(buffer) as OllamaChunk;
          const delta = processData(data);

          if (delta) {
            text += delta;
            yield {
              type: "text_delta",
              delta,
            };
          }
        }
      } finally {
        reader.releaseLock();
      }

      const content: ContentBlock[] = [];

      if (text) {
        content.push({
          type: "text",
          text,
        });
      }

      for (const [index, call] of toolCalls) {
        content.push({
          type: "toolCall",
          id: `ollama-${index}`,
          name: call.name,
          arguments: call.arguments,
        });
      }

      if (toolCalls.size > 0) {
        stopReason = "toolUse";
      }

      yield {
        type: "done",
        message: {
          role: "assistant",
          content,
          usage,
          stopReason,
        },
      };
    },
  };
}


