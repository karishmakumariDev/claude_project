
import { resolve } from "node:path";
import type { Tool } from "../types.ts";
import { walk } from "./fsutil.ts";

export const lsTool: Tool = {
  name: "ls",
  description:
    "List files and directories recursively, skipping common generated folders and hidden files by default.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory to list; defaults to '.'",
      },
      maxDepth: {
        type: "number",
        description: "Maximum directory depth",
      },
      includeHidden: {
        type: "boolean",
        description: "Include hidden files and directories",
      },
      dirsOnly: {
        type: "boolean",
        description: "Only return directories",
      },
    },
  },

  async execute(args) {
    const root = resolve(process.cwd(), String(args.path ?? "."));

    const maxDepth =
      typeof args.maxDepth === "number"
        ? Math.max(1, Math.floor(args.maxDepth))
        : Infinity;

    const includeHidden = Boolean(args.includeHidden);
    const dirsOnly = Boolean(args.dirsOnly);

    const results: string[] = [];
    const limit = 5000;

    for await (const entry of walk(root, {
      maxDepth,
      includeHidden,
    })) {
      if (dirsOnly && !entry.isDirectory) continue;

      results.push(
        entry.isDirectory
          ? `${entry.relPath}/`
          : entry.relPath,
      );

      if (results.length >= limit) {
        results.push(`[Truncated at ${limit} entries]`);
        break;
      }
    }

    return results.length ? results.join("\n") : "(empty)";
  },
};
