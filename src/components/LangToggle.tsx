"use client";

import { useLang } from "@/lib/i18n";

export function LangToggle() {
  const { lang, setLang } = useLang();

  return (
    <div className="lang-switch" role="group" aria-label="Ngôn ngữ / Language">
      <button type="button" className={lang === "vi" ? "is-active" : ""} onClick={() => setLang("vi")}>
        VI
      </button>
      <button type="button" className={lang === "en" ? "is-active" : ""} onClick={() => setLang("en")}>
        EN
      </button>
    </div>
  );
}
