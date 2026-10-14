
import { parseArgs } from "node:util";
import { getProvider } from "./providers/index.ts";
import type { Message } from "./types.ts";

const { values } = parseArgs({
  options: {
    prompt: {
      type: "string",
      short: "p",
    },
    provider: {
      type: "string",
      default: "ollama",
    },
    model: {
      type: "string",
    },
  },
});

async function main(): Promise<void> {
  if (!values.prompt?.trim()) {
    console.error(
      'Usage: npx tsx src/main.ts -p "Your question" --provider ollama'
    );
    process.exitCode = 1;
    return;
  }

  try {
    const provider = getProvider(values.provider);
    const model = values.model ?? provider.defaultModel;

    const messages: Message[] = [
      {
        role: "user",
        content: values.prompt,
      },
    ];

    console.log(`Provider: ${provider.name}`);
    console.log(`Model: ${model}`);
    console.log("\nAI Response:\n");

    for await (const event of provider.stream({
      messages,
      model,
    })) {
      if (event.type === "text_delta") {
        process.stdout.write(event.delta);
      } else if (event.type === "done") {
        console.log("\n");
        console.log("Usage:", event.message.usage);
        console.log("Stop reason:", event.message.stopReason);
      }
    }
  } catch (error) {
    console.error(
      "\nAI request failed:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  }
}

main();

