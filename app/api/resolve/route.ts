import { NextResponse } from "next/server";
import { checkLinks, EMPTY_CHECK, type CheckResponse } from "@/lib/resolve";
import { extractLinks, MAX_TEXT } from "@/lib/links";

/**
 * POST because the input is a paste, not a query string — an asset list can
 * be a few thousand characters and does not belong in a URL. Nothing here is
 * stored; the answer is derived entirely from what the four sources say.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(EMPTY_CHECK);
  }

  const payload = (body ?? {}) as { text?: unknown; urls?: unknown };

  const fromText =
    typeof payload.text === "string"
      ? extractLinks(payload.text.slice(0, MAX_TEXT))
      : [];

  const fromList = Array.isArray(payload.urls)
    ? payload.urls.filter((u): u is string => typeof u === "string")
    : [];

  const links = [...fromText, ...fromList];
  if (links.length === 0) return NextResponse.json(EMPTY_CHECK);

  const result: CheckResponse = await checkLinks(
    links,
    request.headers.get("host"),
  );
  return NextResponse.json(result);
}
