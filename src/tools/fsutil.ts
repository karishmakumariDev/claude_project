import { readdir, stat as fsStat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const DEFAULT_IGNORES = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
];

export function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.split(sep).join("/");
  let output = "";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    // Handle a missing character safely.
    if (char === undefined) continue;

    if (char === "*") {
      if (normalized[i + 1] === "*") {
        i++;

        if (normalized[i + 1] === "/") {
          i++;
        }

        output += "(?:.*/)?";
      } else {
        output += "[^/]*";
      }
    } else if (char === "?") {
      output += "[^/]";
    } else if (".+^${}()|[]\\".includes(char)) {
      output += `\\${char}`;
    } else {
      output += char;
    }
  }

  return new RegExp(`^${output}$`);
}

export function shouldIgnore(
  name: string,
  ignores: string[],
): boolean {
  return ignores.includes(name);
}

export type WalkEntry = {
  absPath: string;
  relPath: string;
  isDirectory: boolean;
};

export type WalkOptions = {
  maxDepth?: number;
  includeHidden?: boolean;
  ignores?: string[];
};

export async function* walk(
  root: string,
  options: WalkOptions = {},
): AsyncGenerator<WalkEntry> {
  const ignores = options.ignores ?? DEFAULT_IGNORES;
  const maxDepth = options.maxDepth ?? Infinity;
  const includeHidden = options.includeHidden ?? false;

  async function* recurse(
    directory: string,
    depth: number,
  ): AsyncGenerator<WalkEntry> {
    let entries;

    try {
      entries = await readdir(directory, {
        withFileTypes: true,
      });
    } catch {
      // Skip directories that cannot be read.
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (shouldIgnore(entry.name, ignores)) continue;

      if (!includeHidden && entry.name.startsWith(".")) {
        continue;
      }

      const absPath = join(directory, entry.name);
      const relPath = relative(root, absPath)
        .split(sep)
        .join("/");

      const isDirectory = entry.isDirectory();

      yield {
        absPath,
        relPath,
        isDirectory,
      };

      if (isDirectory && depth < maxDepth) {
        yield* recurse(absPath, depth + 1);
      }
    }
  }

  yield* recurse(root, 1);
}

export async function pathExists(
  path: string,
): Promise<boolean> {
  try {
    await fsStat(path);
    return true;
  } catch {
    return false;
  }
}


