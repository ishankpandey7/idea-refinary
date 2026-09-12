import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceResult } from "@/types/source-result";

const DIR = path.join(process.cwd(), "fixtures");

export const isRecording = (): boolean => process.env.RECORD === "1";
export const isDemo = (): boolean => process.env.DEMO === "1";

export function slug(query: string): string {
  return (
    query
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "empty"
  );
}

export function fixturePath(adapterId: string, query: string): string {
  return path.join(DIR, `${adapterId}-${slug(query)}.json`);
}

export async function readFixture(
  adapterId: string,
  query: string,
): Promise<SourceResult[]> {
  try {
    const raw = await readFile(fixturePath(adapterId, query), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error(`[${adapterId}] fixture not an array: ${slug(query)}`);
      return [];
    }
    return parsed as SourceResult[];
  } catch {
    console.error(`[${adapterId}] fixture miss: ${slug(query)}`);
    return [];
  }
}

export async function writeFixture(
  adapterId: string,
  query: string,
  results: SourceResult[],
): Promise<void> {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(
      fixturePath(adapterId, query),
      `${JSON.stringify(results, null, 2)}\n`,
      "utf8",
    );
  } catch (err) {
    console.error(
      `[${adapterId}] fixture write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
