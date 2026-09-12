import type { Adapter } from "@/types/source-result";
import { adapter as openalex } from "./openalex";
import { adapter as openverse } from "./openverse";
import { adapter as gutendex } from "./gutendex";
import { adapter as wikimedia } from "./wikimedia";

export const adapters: Adapter[] = [openalex, openverse, gutendex, wikimedia];

export type Category = Adapter["categories"][number];

export function adaptersFor(category: string | null): Adapter[] {
  if (!category) return adapters;
  return adapters.filter((a) =>
    (a.categories as readonly string[]).includes(category),
  );
}
