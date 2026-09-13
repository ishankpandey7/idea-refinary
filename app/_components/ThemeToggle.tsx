"use client";

import { useStored } from "../_lib/stored";

export type Theme = "light" | "dark" | "auto";

/** Read by the inline script in the layout too — keep the two in step. */
export const THEME_KEY = "idea-refinery:theme";

const ORDER: Theme[] = ["light", "dark", "auto"];
const GLYPH: Record<Theme, string> = {
  light: "☀",
  dark: "☾",
  auto: "◐",
};
const LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

function isTheme(v: string | null): v is Theme {
  return v === "light" || v === "dark" || v === "auto";
}

/**
 * "auto" removes the attribute rather than setting it, which is what lets the
 * prefers-color-scheme block in globals.css take over again.
 */
function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  // The inline script in the layout has already painted the right colours off
  // this same key; the button only needs it for its own label. Reading it as
  // an external store means no mount effect and no second render.
  const [raw, setRaw] = useStored(THEME_KEY, "auto");
  const theme: Theme = isTheme(raw) ? raw : "auto";

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    apply(next);
    setRaw(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} — click to change`}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-[13px] text-body transition hover:border-accent hover:text-accent"
    >
      <span aria-hidden>{GLYPH[theme]}</span>
    </button>
  );
}
