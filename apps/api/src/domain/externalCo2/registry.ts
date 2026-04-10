import type { ExternalCo2SourceHandler } from "./types.ts";
import { co2refStaticSource } from "./sources/co2refStatic.ts";

const handlers: Record<string, ExternalCo2SourceHandler> = {
  [co2refStaticSource.key]: co2refStaticSource,
};

export function getExternalCo2Handler(key: string): ExternalCo2SourceHandler | null {
  return handlers[key] ?? null;
}

export function listRegisteredExternalCo2Keys(): string[] {
  return Object.keys(handlers);
}
