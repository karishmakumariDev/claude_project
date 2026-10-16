import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { getProvider } from "./providers/index.ts";
import type { Message } from "./types.ts";
import { runAgent } from "./agent/loop.ts";
import { tools } from "./tools/index.ts";

// Load .env from the project root.
config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

// Read command-line arguments.
const { values } = parseArgs({
  options: {
    prompt: { type: "string", short: "p" },
    provider: { type: "string", default: "ollama" },
    model: { type: "string" },
  },
});

// Validate the prompt.
if (!values.prompt?.trim()) {
  console.error(
    'Usage: npm run dev -- -p "Your prompt" [--provider ollama] [--model llama3.2:1b]'
  );
  process.exit(1);
}

// Select provider and model.
const provider = getProvider(values.provider ?? "ollama");
const model = values.model ?? provider.defaultModel;

// Instructions for the AI assistant.
const system = `
You are a helpful AI coding assistant.

Rules:
- Answer general knowledge questions directly in plain text.
- Respond naturally to greetings.
- Do not call tools for ordinary questions.
- Use tools when the user requests actions involving project files.
- Use stat only when file or directory metadata is requested.
- Never show raw tool definitions or tool schemas as the answer.
- Never invent tool results.
- Explain errors clearly and concisely.
`;

// Start a new conversation.
const messages: Message[] = [
  {
    role: "user",
    content: values.prompt,
  },
];

// Run the agent.
try {
  await runAgent({
    provider,
    model,
    system,
    tools,
    messages,

    onEvent(event) {
      if (event.type === "text") {
        process.stdout.write(event.delta);
        return;
      }

      if (event.type === "tool_start") {
        console.log(`\n\n[Tool started: ${event.call.name}]`);
        console.log(
          `[Tool arguments: ${JSON.stringify(event.call.arguments)}]`
        );
        return;
      }

      if (event.type === "tool_end") {
        if (event.isError) {
          console.error(`\n[Tool error: ${event.result}]`);
        } else {
          console.log(`\n[Tool result: ${event.call.name}]`);
          console.log(event.result);
        }
        return;
      }

      if (event.type === "turn_end") {
        const { usage, stopReason } = event.message;

        console.log(
          `\n\n[Provider: ${provider.name} | Model: ${model} | Input tokens: ${usage.input} | Output tokens: ${usage.output} | Stop reason: ${stopReason}]`
        );
      }
    },
  });
} catch (error) {
  console.error(
    "\nAgent error:",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
}

