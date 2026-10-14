
import type {
  Provider,
  StreamOptions,
  StopReason,
  Usage,
} from "../types.ts";

export function createOllama(): Provider {
  return {
    name: "ollama",
    defaultModel: "llama3.2:1b",

    async *stream({ messages, model, system }: StreamOptions) {
      const ollamaMessages = [
        ...(system
          ? [{ role: "system", content: system }]
          : []),
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];

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
      let usage: Usage = { input: 0, output: 0 };
      let stopReason: StopReason = "stop";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const data = JSON.parse(line);

            if (data.error) {
              throw new Error(data.error);
            }

            const delta = data.message?.content ?? "";

            if (delta) {
              text += delta;
              yield { type: "text_delta", delta };
            }

            if (data.prompt_eval_count !== undefined) {
              usage = {
                ...usage,
                input: data.prompt_eval_count,
              };
            }

            if (data.eval_count !== undefined) {
              usage = {
                ...usage,
                output: data.eval_count,
              };
            }

            if (data.done && data.done_reason === "length") {
              stopReason = "length";
            }
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          const data = JSON.parse(buffer);

          if (data.error) {
            throw new Error(data.error);
          }

          const delta = data.message?.content ?? "";

          if (delta) {
            text += delta;
            yield { type: "text_delta", delta };
          }

          if (data.prompt_eval_count !== undefined) {
            usage = { ...usage, input: data.prompt_eval_count };
          }

          if (data.eval_count !== undefined) {
            usage = { ...usage, output: data.eval_count };
          }

          if (data.done && data.done_reason === "length") {
            stopReason = "length";
          }
        }
      } finally {
        reader.releaseLock();
      }

      yield {
        type: "done",
        message: {
          role: "assistant",
          content: text,
          usage,
          stopReason,
        },
      };
    },
  };
}
