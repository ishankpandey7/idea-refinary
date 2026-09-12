// contract-v1 — frozen. Changes require a full team stop.

export type Spdx =
  | "CC0-1.0" | "CC-BY" | "CC-BY-4.0"
  | "CC-BY-SA" | "CC-BY-SA-4.0" | "CC-BY-NC"
  | "PD" | "OPEN-ACCESS" | "UNKNOWN";

export type MediaType = "paper" | "image" | "text" | "record";

export type SourceResult = {
  sourceId:     string;
  externalId:   string;
  canonicalUrl: string;
  title:        string;
  authors:      string[];
  publishedAt:  string | null;
  mediaType:    MediaType;
  licence: {
    spdx:        Spdx;
    url:         string | null;
    assertedBy:  string;
    attribution: string;
  };
  snippet:      string | null;
  thumbnailUrl: string | null;
  raw:          unknown;
};

export type Adapter = {
  id: string;
  label: string;
  categories: Array<"research" | "art" | "writing">;
  search: (query: string) => Promise<SourceResult[]>;
};
