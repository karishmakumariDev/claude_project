
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { Tool } from "../types.ts";

export function findBash(): string {
  if (process.platform !== "win32") return "bash";

  const candidates = [
    `${process.env.ProgramFiles}\\Git\\bin\\bash.exe`,
    `${process.env["ProgramFiles(x86)"]}\\Git\\bin\\bash.exe`,
    `${process.env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`,
  ];

  const found = candidates.find((path) => existsSync(path));
  if (found) return found;

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir || /\\system32$/i.test(dir.replace(/\\+$/, ""))) continue;
    const candidate = join(dir, "bash.exe");
    if (existsSync(candidate)) return candidate;
  }

  return "bash";
}

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;

export function truncateTail(
  text: string,
  maxLines = MAX_LINES,
  maxBytes = MAX_BYTES,
): string {
  const lines = text.split("\n");
  const kept = lines.slice(-maxLines);
  let output = kept.join("\n");

  while (
    kept.length > 1 &&
    Buffer.byteLength(output) > maxBytes
  ) {
    kept.shift();
    output = kept.join("\n");
  }

  if (Buffer.byteLength(output) > maxBytes) {
    output = output.slice(-maxBytes);
  }

  if (kept.length === lines.length && output === text) {
    return text;
  }

  return `[Output truncated]\n${output}`;
}

function runBash(
  command: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(findBash(), ["-c", command], {
      cwd: process.cwd(),
      windowsHide: true,
    });

    let output = "";
    let timedOut = false;
    let settled = false;

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;

      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", [
          "/F",
          "/T",
          "/PID",
          String(child.pid),
        ]);
      } else {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      finish(`Failed to start shell: ${error.message}`);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        output += `\n[Timed out after ${timeoutMs / 1000}s]`;
      }

      output += `\n[Exit code: ${code}]`;
      finish(output);
    });
  });
}

export const bashTool: Tool = {
  name: "bash",
  description:
    "Run a shell command in the current project directory and return its output and exit code.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds; default is 30",
      },
    },
    required: ["command"],
  },

  async execute(args) {
    const command = String(args.command ?? "");

    if (!command.trim()) {
      throw new Error("Command cannot be empty.");
    }

    const seconds =
      typeof args.timeout === "number"
        ? Math.min(Math.max(args.timeout, 1), 120)
        : 30;

    const output = await runBash(command, seconds * 1000);
    return truncateTail(output);
  },
};
