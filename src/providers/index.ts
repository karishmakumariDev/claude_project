
import type { Provider } from "../types.ts";
import { createOllama } from "./ollama.ts";

const providers: Record<string, () => Provider> = {
  ollama: createOllama,
};

export function getProvider(name: string): Provider {
  const create = providers[name.toLowerCase()];

  if (!create) {
    throw new Error(
      `Unknown provider "${name}". Available providers: ${Object.keys(providers).join(", ")}`
    );
  }

  return create();
}
