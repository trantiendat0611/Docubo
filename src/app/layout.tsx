import type { Metadata } from "next";
// Required for rehype-katex output. Without it, formulas render as raw
// unstyled characters.
import "katex/dist/katex.min.css";
import "./globals.css";

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
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
