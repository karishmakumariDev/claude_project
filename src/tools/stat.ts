import { lstat } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import type { Tool } from "../types.ts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(2)} ${units[unit]}`;
}

export const statTool: Tool = {
  name: "stat",

  description:
    "Get metadata for an existing file or directory. Use '.' for the current project directory. Do not use this tool for general knowledge questions.",

  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Existing file or directory path relative to the current project. Use '.' for the project root.",
      },
    },
    required: ["path"],
  },

  async execute(args) {
    const rawPath = args.path;

    if (typeof rawPath !== "string" || rawPath.trim() === "") {
      return 'Error: A valid "path" is required. Use "." for the current directory.';
    }

    const inputPath = rawPath.trim();

    // Keep paths inside the current project directory.
    const root = resolve(process.cwd());
    const target = resolve(root, inputPath);
    const relPath = relative(root, target);

    if (
      isAbsolute(inputPath) ||
      relPath === ".." ||
      relPath.startsWith(`..${sep}`)
    ) {
      return "Error: Path must be inside the current project directory.";
    }

    try {
      const info = await lstat(target);

      const type = info.isSymbolicLink()
        ? "symlink"
        : info.isDirectory()
          ? "directory"
          : info.isFile()
            ? "file"
            : "other";

      return [
        `path: ${relPath || "."}`,
        `type: ${type}`,
        `size: ${info.size} bytes (${formatBytes(info.size)})`,
        `created: ${info.birthtime.toISOString()}`,
        `modified: ${info.mtime.toISOString()}`,
        `accessed: ${info.atime.toISOString()}`,
        `permissions: ${(info.mode & 0o777).toString(8)}`,
      ].join("\n");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
      ) {
        return `Error: Path does not exist: ${inputPath}`;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EACCES"
      ) {
        return `Error: Permission denied: ${inputPath}`;
      }

      return `Error: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  },
};
