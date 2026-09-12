"use client";

import { useEffect, useState } from "react";

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
  const [theme, setTheme] = useState<Theme>("auto");
  const [ready, setReady] = useState(false);

  // The inline script has already painted the right colours; this only syncs
  // the button's own label, so it can wait for mount.
  useEffect(() => {
    let stored: Theme = "auto";
    try {
      const raw = window.localStorage.getItem(THEME_KEY);
      if (isTheme(raw)) stored = raw;
    } catch {
      // Storage blocked — stay on auto.
    }
    setTheme(stored);
    setReady(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not persisted, but the page still switches for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} — click to change`}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-[13px] text-body transition hover:border-accent hover:text-accent"
    >
      <span aria-hidden>{ready ? GLYPH[theme] : ""}</span>
    </button>
  );
}
