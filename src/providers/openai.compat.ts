// import OpenAI from "openai";
// import type { ContentBlock, Message, Provider, StopReason, Usage } from "../types.ts";

// // our messages -> OpenAI's wire format
// function toOpenAI(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
//   return messages.map((m): OpenAI.ChatCompletionMessageParam => {
//     if (m.role === "user") return { role: "user", content: m.content };
//     if (m.role === "assistant") {
//       const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
//       const calls = m.content.filter((b) => b.type === "toolCall");
//       return {
//         role: "assistant",
//         content: text || null,
//         // OpenAI wants the arguments as a JSON *string*
//         tool_calls: calls.length
//           ? calls.map((c) => ({
//             id: c.id,
//             type: "function" as const,
//             function: { name: c.name, arguments: JSON.stringify(c.arguments) },
//           }))
//           : undefined,
//       };
//     }
//     // toolResult -> its own message with role "tool"
//     return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
//   });
// }

// // one adapter for every OpenAI-compatible API: only baseURL, key and model change
// export function createOpenAICompat(name: string, baseURL: string, apiKey: string | undefined, defaultModel: string): Provider {
//   const client = new OpenAI({ baseURL, apiKey });
//   return {
//     name,
//     defaultModel,
//     async *stream({ messages, model, system, tools = [] }) {
//       const chat = toOpenAI(messages);
//       const stream = await client.chat.completions.create({
//         model,
//         stream: true,
//         stream_options: { include_usage: true }, // usage comes in the last chunk
//         messages: system ? [{ role: "system", content: system }, ...chat] : chat,
//         tools: tools.length
//           ? tools.map((t) => ({
//             type: "function" as const,
//             function: { name: t.name, description: t.description, parameters: t.parameters },
//           }))
//           : undefined,
//       });
//       let text = "";
//       const calls: { id: string; name: string; args: string }[] = []; // slot = tool_calls[].index
//       let usage: Usage = { input: 0, output: 0 };
//       let stopReason: StopReason = "stop";
//       for await (const chunk of stream) {
//         const choice = chunk.choices[0];
//         if (choice?.delta?.content) {
//           text += choice.delta.content;
//           yield { type: "text_delta", delta: choice.delta.content };
//         }
//         for (const tc of choice?.delta?.tool_calls ?? []) {
//           // the first piece of a call brings id + name, later pieces only bring more arguments
//           calls[tc.index] ??= { id: tc.id ?? `call_${tc.index}`, name: tc.function?.name ?? "", args: "" };
//           const call = calls[tc.index];

//           if (call) {
//             call.args += tc.function?.arguments ?? "";
//           }
//         }
//         if (choice?.finish_reason === "tool_calls") stopReason = "toolUse";
//         else if (choice?.finish_reason === "length") stopReason = "length";
//         if (chunk.usage) usage = { input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens };
//       }
//       const content: ContentBlock[] = text ? [{ type: "text", text }] : [];
//       for (const c of calls) {
//         if (c) content.push({ type: "toolCall", id: c.id, name: c.name, arguments: c.args ? JSON.parse(c.args) : {} });
//       }
//       if (content.some((b) => b.type === "toolCall")) stopReason = "toolUse";
//       yield { type: "done", message: { role: "assistant", content, usage, stopReason } };
//     },
//   };
// }

import OpenAI from "openai";
import type {
  ContentBlock,
  Message,
  Provider,
  StopReason,
  Usage,
  ToolCallBlock,
} from "../types.ts";

// Convert our messages into OpenAI's message format.
function toOpenAI(
  messages: Message[]
): OpenAI.ChatCompletionMessageParam[] {
  return messages.map(
    (m): OpenAI.ChatCompletionMessageParam => {
      if (m.role === "user") {
        return {
          role: "user",
          content: m.content,
        };
      }

      if (m.role === "assistant") {
        const text = m.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");

        const calls = m.content.filter(
          (b): b is ToolCallBlock => b.type === "toolCall"
        );

        return {
          role: "assistant",
          content: text || null,
          ...(calls.length > 0
            ? {
                tool_calls: calls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: {
                    name: c.name,
                    arguments: JSON.stringify(c.arguments),
                  },
                })),
              }
            : {}),
        };
      }

      // Convert tool results into OpenAI's tool message format.
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      };
    }
  );
}

// Create a provider for OpenAI-compatible APIs.
export function createOpenAICompat(
  name: string,
  baseURL: string,
  apiKey: string | undefined,
  defaultModel: string
): Provider {
  const client = new OpenAI({
    baseURL,
    apiKey,
  });

  return {
    name,
    defaultModel,

    async *stream({
      messages,
      model,
      system,
      tools = [],
    }) {
      const chat = toOpenAI(messages);

      const requestMessages: OpenAI.ChatCompletionMessageParam[] = [
        ...(system !== undefined
          ? [{ role: "system" as const, content: system }]
          : []),
        ...chat,
      ];

      const requestTools: OpenAI.ChatCompletionTool[] =
        tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters:
              t.parameters as OpenAI.FunctionParameters,
          },
        }));

      const stream = await client.chat.completions.create({
        model,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        messages: requestMessages,
        ...(requestTools.length > 0
          ? { tools: requestTools }
          : {}),
      });

      let text = "";

      const calls: {
        id: string;
        name: string;
        args: string;
      }[] = [];

      let usage: Usage = {
        input: 0,
        output: 0,
      };

      let stopReason: StopReason = "stop";

      for await (const chunk of stream) {
        const choice = chunk.choices[0];

        // Handle normal text responses.
        if (choice?.delta?.content) {
          const delta = choice.delta.content;
          text += delta;

          yield {
            type: "text_delta",
            delta,
          };
        }

        // Handle streamed tool calls.
        for (const tc of choice?.delta?.tool_calls ?? []) {
          const index = tc.index;

          calls[index] ??= {
            id: tc.id ?? `call_${index}`,
            name: "",
            args: "",
          };

          const call = calls[index];

          if (!call) continue;

          if (tc.id) {
            call.id = tc.id;
          }

          if (tc.function?.name) {
            call.name += tc.function.name;
          }

          if (tc.function?.arguments) {
            call.args += tc.function.arguments;
          }
        }

        if (choice?.finish_reason === "tool_calls") {
          stopReason = "toolUse";
        } else if (choice?.finish_reason === "length") {
          stopReason = "length";
        }

        // Read token usage from the final stream chunk.
        if (chunk.usage) {
          usage = {
            input: chunk.usage.prompt_tokens,
            output: chunk.usage.completion_tokens,
          };
        }
      }

      // Build the assistant's content blocks.
      const content: ContentBlock[] = [];

      if (text) {
        content.push({
          type: "text",
          text,
        });
      }

      for (const call of calls) {
        if (!call) continue;

        let args: Record<string, unknown> = {};

        if (call.args) {
          try {
            const parsed: unknown = JSON.parse(call.args);

            if (
              parsed !== null &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              args = parsed as Record<string, unknown>;
            }
          } catch {
            throw new Error(
              `Invalid JSON arguments for tool "${call.name}"`
            );
          }
        }

        content.push({
          type: "toolCall",
          id: call.id,
          name: call.name,
          arguments: args,
        });
      }

      if (content.some((block) => block.type === "toolCall")) {
        stopReason = "toolUse";
      }

      // Send the final assistant message to the agent loop.
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
