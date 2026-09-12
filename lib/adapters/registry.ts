import type { Adapter } from "@/types/source-result";
import { adapter as openalex } from "./openalex";
import { adapter as openverse } from "./openverse";
import { adapter as gutendex } from "./gutendex";

export const adapters: Adapter[] = [openalex, openverse, gutendex];

export type Category = Adapter["categories"][number];

export function adaptersFor(category: string | null): Adapter[] {
  if (!category) return adapters;
  return adapters.filter((a) =>
    (a.categories as readonly string[]).includes(category),
  );
}
