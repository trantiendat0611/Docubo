"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

type Theme = "light" | "dark";

/**
 * Manual light/dark override, layered on top of the OS-preference default
 * every other page already gets from globals.css's prefers-color-scheme
 * rules. Only this page needs a visible switch — the authenticated app
 * still just follows the OS, which is fine for a tool used in one browser
 * session at a time; a public landing page is where a visitor's own choice
 * matters enough to expose.
 */
export function ThemeToggle() {
  // Starts null so the button renders nothing until mount — reading
  // localStorage during render would disagree with the server-rendered
  // markup and React would warn about a hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null);
  const { t } = useLang();

  useEffect(() => {
    const stored = localStorage.getItem("docubo-theme");
    setTheme(stored === "light" || stored === "dark" ? stored : null);
  }, []);

  function apply(next: Theme | null) {
    setTheme(next);
    if (next) {
      localStorage.setItem("docubo-theme", next);
      document.documentElement.dataset.theme = next;
    } else {
      localStorage.removeItem("docubo-theme");
      delete document.documentElement.dataset.theme;
    }
  }

  // Cycles light -> dark -> back to following the OS, rather than a plain
  // two-state flip — otherwise a visitor whose OS is dark and who taps the
  // button once lands on light with no way back to "just follow the system"
  // short of clearing site data.
  function next() {
    if (theme === null) apply("dark");
    else if (theme === "dark") apply("light");
    else apply(null);
  }

  const label = theme === "dark" ? t.theme.dark : theme === "light" ? t.theme.light : t.theme.system;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={next}
      aria-label={t.theme.describe(label)}
      title={label}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ) : theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 1.3v1.6M8 13.1v1.6M2.9 8H1.3M14.7 8h-1.6M3.9 3.9l1.1 1.1M11 11l1.1 1.1M12.1 3.9 11 5M5 11l-1.1 1.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 13.5h5M8 11v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}
