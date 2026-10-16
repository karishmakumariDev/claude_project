

import { resolve } from "node:path";
import type { Tool } from "../types.ts";
import { globToRegExp, walk } from "./fsutil.ts";

const LIMIT = 2000;

export const findTool: Tool = {
  name: "find",
  description:
    "Find files and directories by name, glob pattern, or regular expression.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Substring to match against a file or directory name",
      },
      glob: {
        type: "string",
        description: "Glob pattern, such as **/*.ts",
      },
      regex: {
        type: "string",
        description: "Regular expression for relative paths",
      },
      path: {
        type: "string",
        description: "Directory to search under; defaults to '.'",
      },
      type: {
        type: "string",
        description: "Filter by file or dir",
      },
      includeHidden: {
        type: "boolean",
        description: "Include hidden files and directories",
      },
    },
  },

  async execute(args) {
    const root = resolve(process.cwd(), String(args.path ?? "."));
    const name = args.name
      ? String(args.name).toLowerCase()
      : undefined;

    const glob = args.glob
      ? globToRegExp(String(args.glob))
      : undefined;

    let regex: RegExp | undefined;

    if (args.regex) {
      try {
        regex = new RegExp(String(args.regex));
      } catch (error) {
        return `Invalid regex: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    if (!name && !glob && !regex) {
      return "Provide at least one of name, glob, or regex.";
    }

    const type = args.type ? String(args.type) : undefined;
    const results: string[] = [];

    for await (const entry of walk(root, {
      includeHidden: Boolean(args.includeHidden),
    })) {
      if (type === "file" && entry.isDirectory) continue;
      if (type === "dir" && !entry.isDirectory) continue;

      const baseName =
        entry.relPath.split("/").pop() ?? entry.relPath;

      if (name && !baseName.toLowerCase().includes(name)) continue;
      if (glob && !glob.test(entry.relPath)) continue;
      if (regex && !regex.test(entry.relPath)) continue;

      results.push(
        entry.isDirectory
          ? `${entry.relPath}/`
          : entry.relPath,
      );

      if (results.length >= LIMIT) {
        results.push(`[Truncated at ${LIMIT} results]`);
        break;
      }
    }

    return results.length ? results.join("\n") : "(no matches)";
  },
};
