
import { config } from "dotenv";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

// Load .env file (optional)
config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const { values } = parseArgs({
  options: {
    prompt: {
      type: "string",
      short: "p",
    },
    model: {
      type: "string",
      default: "llama3.2:1b",
    },
  },
});

async function main(): Promise<void> {
  if (!values.prompt?.trim()) {
    console.error(
      'Usage: npx tsx src/main.ts -p "Your question"'
    );
    process.exitCode = 1;
    return;
  }

  try {
    const response = await fetch(
      "http://localhost:11434/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: values.model,
          messages: [
            {
              role: "user",
              content: values.prompt,
            },
          ],
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
      throw new Error("Ollama response body is empty.");
    }

    console.log("\nOllama AI Response:\n");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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

        if (data.message?.content) {
          process.stdout.write(data.message.content);
        }
      }
    }

    // Process any remaining response data
    buffer += decoder.decode();

    if (buffer.trim()) {
      const data = JSON.parse(buffer);

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.message?.content) {
        process.stdout.write(data.message.content);
      }
    }

    console.log("\n");
  } catch (error) {
    console.error(
      "\nFailed to get AI response:",
      error instanceof Error ? error.message : error
    );

    console.error(
      "Check that Ollama is running and the model is installed."
    );

    process.exitCode = 1;
  }
}

main();

