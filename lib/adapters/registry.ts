import type { Adapter } from "@/types/source-result";
import { adapter as openalex } from "./openalex";
import { adapter as openverse } from "./openverse";

export const adapters: Adapter[] = [openalex, openverse];

export type Category = Adapter["categories"][number];

export function adaptersFor(category: string | null): Adapter[] {
  if (!category) return adapters;
  return adapters.filter((a) =>
    (a.categories as readonly string[]).includes(category),
  );
}
