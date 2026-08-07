"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * Renders answer markdown with LaTeX.
 *
 * remark-math parses $...$ and $$...$$, rehype-katex renders them. The KaTeX
 * stylesheet is imported once in app/layout.tsx — without it formulas render as
 * unstyled character soup, which looks like a model failure but is not.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
