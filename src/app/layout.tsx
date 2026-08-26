import type { Metadata } from "next";
import { Be_Vietnam_Pro, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
// Required for rehype-katex output. Without it, formulas render as raw
// unstyled characters.
import "katex/dist/katex.min.css";
import "./globals.css";

// Three faces, one job each: Be Vietnam Pro carries the brand and section
// headings (display, used sparingly) — a geometric sans built for this
// language's diacritics, not a serif borrowed from an editorial context.
// Plex Sans runs the interface, Plex Mono sets anything that counts — page
// numbers, scores, citation digits. Self-hosted by next/font, so there is no
// runtime request to Google Fonts.
const display = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Docubo",
  description:
    "Hỏi đáp tài liệu chuyên ngành song ngữ, có trích dẫn nguồn và công thức toán",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {/* Runs before paint so a manually-chosen theme (ThemeToggle, any
            page) applies immediately everywhere in the site rather than
            flashing the OS default first. Reads only its own localStorage
            key and touches nothing else — safe to run unconditionally. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("docubo-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
