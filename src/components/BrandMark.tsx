/**
 * The wordmark's companion glyph: a chat bubble — the shape people already
 * read as "chatbot" on sight — with a citation bracket cut into it instead
 * of a smiley or three dots, because the thing this bot does differently is
 * back every reply with a page. Echoed at badge scale in app/icon.svg. Drawn
 * with currentColor so it takes the accent color from whichever heading it
 * sits beside.
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-hidden="true"
    >
      <path
        d="M4.5 4.5h15a1.4 1.4 0 0 1 1.4 1.4v8.6a1.4 1.4 0 0 1-1.4 1.4H9.8l-3.6 3.4v-3.4H4.5a1.4 1.4 0 0 1-1.4-1.4V5.9a1.4 1.4 0 0 1 1.4-1.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M10.1 7.6H8.5v5.2h1.6M13.9 7.6h1.6v5.2h-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
