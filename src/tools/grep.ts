import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "../types.ts";
import { globToRegExp, walk } from "./fsutil.ts";

const MAX_MATCHES = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const grepTool: Tool = {
  name: "grep",

  description:
    "Search for a regular expression inside files. Returns file path, line number, and matching text.",

  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regular expression to search for",
      },
      path: {
        type: "string",
        description: "Directory to search; defaults to '.'",
      },
      glob: {
        type: "string",
        description: "Optional glob, such as **/*.ts",
      },
      ignoreCase: {
        type: "boolean",
        description: "Enable case-insensitive search",
      },
      maxMatches: {
        type: "number",
        description: "Maximum number of matches to return",
      },
    },
    required: ["pattern"],
  },

  async execute(args) {
    const root = resolve(
      process.cwd(),
      String(args.path ?? ".")
    );

    const ignoreCase = args.ignoreCase === true;

    const maxMatches =
      typeof args.maxMatches === "number" &&
      Number.isFinite(args.maxMatches)
        ? Math.min(
            MAX_MATCHES,
            Math.max(1, Math.floor(args.maxMatches))
          )
        : MAX_MATCHES;

    let globRegex: RegExp | undefined;

    if (args.glob) {
      try {
        globRegex = globToRegExp(String(args.glob));
      } catch (error) {
        return `Invalid glob: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    let regex: RegExp;

    try {
      regex = new RegExp(
        String(args.pattern),
        ignoreCase ? "i" : ""
      );
    } catch (error) {
      return `Invalid regex: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    const results: string[] = [];

    outer: for await (const entry of walk(root)) {
      if (entry.isDirectory) continue;

      if (globRegex && !globRegex.test(entry.relPath)) {
        continue;
      }

      try {
        const buffer = await readFile(entry.absPath);

        // Skip files that are too large or likely binary.
        if (buffer.length > MAX_FILE_BYTES) continue;
        if (buffer.includes(0)) continue;

        const lines = buffer.toString("utf8").split("\n");

        for (let index = 0; index < lines.length; index++) {
          const line = lines[index];

          // Strict TypeScript check: the line may be undefined.
          if (line === undefined) continue;

          regex.lastIndex = 0;

          if (regex.test(line)) {
            results.push(
              `${entry.relPath}:${index + 1}:${line}`
            );

            if (results.length >= maxMatches) {
              results.push(
                `[Truncated at ${maxMatches} matches]`
              );
              break outer;
            }
          }
        }
      } catch {
        // Skip files that cannot be read.
      }
    }

    return results.length > 0
      ? results.join("\n")
      : "(no matches)";
  },
};
