"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

type Lang = "vi" | "en";

/** Fades a section up into place the first time it crosses the viewport,
    never again after — a scroll-in flourish, not a scroll-driven one.
    prefers-reduced-motion is handled once, globally, in globals.css. */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${visible ? " is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}

const STACK = [
  {
    group: { vi: "Frontend & API", en: "Frontend & API" },
    name: "Next.js 15",
    detail: { vi: "Trên Vercel Hobby — miễn phí", en: "On Vercel Hobby — free tier" },
    tags: ["react", "app-router", "vercel"],
    href: "https://nextjs.org",
  },
  {
    group: { vi: "Xác thực & dữ liệu", en: "Auth & data" },
    name: "Supabase",
    detail: { vi: "Auth, Postgres, pgvector, Storage — một dịch vụ", en: "Auth, Postgres, pgvector, Storage — one service" },
    tags: ["postgres", "pgvector", "rls"],
    href: "https://supabase.com",
  },
  {
    group: { vi: "Mô hình", en: "Model" },
    name: "Gemini Flash",
    detail: { vi: "Vision, phân tích truy vấn, sinh câu trả lời — chain 4 model", en: "Vision, query analysis, generation — a 4-model chain" },
    tags: ["vision", "chain-fallback"],
    href: "https://ai.google.dev",
  },
  {
    group: { vi: "Vector DB", en: "Vector DB" },
    name: "pgvector + HNSW",
    detail: { vi: "768 chiều, cosine, cùng database với dữ liệu quan hệ", en: "768 dims, cosine, same database as relational data" },
    tags: ["hnsw", "768d"],
    href: "https://github.com/pgvector/pgvector",
  },
  {
    group: { vi: "Render PDF", en: "PDF rendering" },
    name: "pdfjs-dist",
    detail: { vi: "Chạy trong trình duyệt — không cần canvas binding phía server", en: "Runs in the browser — no server-side canvas binding" },
    tags: ["client-side"],
    href: "https://mozilla.github.io/pdf.js/",
  },
  {
    group: { vi: "DOCX/TXT", en: "DOCX/TXT" },
    name: "mammoth",
    detail: { vi: "Trích văn bản thuần từ .docx, phía server", en: "Plain-text extraction from .docx, server-side" },
    tags: ["server-only"],
    href: "https://github.com/mwilliamson/mammoth.js",
  },
  {
    group: { vi: "Ingest hàng loạt", en: "Batch ingest" },
    name: "Python + PyMuPDF",
    detail: { vi: "CLI nội bộ, dùng cho corpus lớn và bộ eval", en: "Internal CLI, for large corpora and the eval set" },
    tags: ["cli", "eval"],
    href: "https://pymupdf.readthedocs.io",
  },
  {
    group: { vi: "CI/CD", en: "CI/CD" },
    name: "GitHub Actions",
    detail: { vi: "Lint, typecheck, test, build — mỗi lần push", en: "Lint, typecheck, test, build — on every push" },
    tags: ["lint", "test", "build"],
    href: "https://github.com/features/actions",
  },
] as const;

const DECISIONS = [
  {
    n: "01",
    vi: {
      title: "Ingest bằng vision, không đọc lớp text của PDF",
      body: "Mỗi trang render thành ảnh (pdfjs, 200dpi) rồi đưa qua Gemini để đọc — không parse lớp text nhúng sẵn. Lớp text của PDF mã hoá theo toạ độ glyph, không theo ngữ nghĩa đọc: công thức toán trích ra thành chuỗi rác, biểu đồ trích ra thành chuỗi rỗng.",
    },
    en: {
      title: "Ingest through vision, not the PDF's text layer",
      body: "Every page renders to an image (pdfjs, 200dpi) and goes through Gemini to read — not the embedded text layer. That layer is encoded by glyph position, not reading order: formulas come out as garbage, charts come out as nothing.",
    },
  },
  {
    n: "02",
    vi: {
      title: "Mỗi chunk mang hai biểu diễn song song",
      body: "embed_text (văn xuôi, công thức đã diễn giải thành lời) dùng để tìm kiếm. display_text (giữ nguyên LaTeX) dùng để hiển thị và làm ngữ cảnh cho model. Đo thực nghiệm: LaTeX thô lập chỉ mục full-text thành token rác, không khớp được câu hỏi nào.",
    },
    en: {
      title: "Every chunk carries two representations",
      body: "embed_text (prose, formulas read aloud) is what gets searched. display_text (LaTeX intact) is what gets shown and fed to the model as context. Measured: raw LaTeX indexes into garbage full-text tokens that never match a real question.",
    },
  },
  {
    n: "03",
    vi: {
      title: "Truy hồi hybrid ba nhánh, hợp nhất bằng RRF",
      body: "Dense (cosine trên vector 768 chiều) bắt ngữ nghĩa xuyên ngôn ngữ; full-text tiếng Anh và tiếng Việt (hai cột tsvector riêng) bắt từ khoá chính xác. Ba danh sách hợp nhất bằng Reciprocal Rank Fusion.",
    },
    en: {
      title: "Hybrid three-arm retrieval, fused with RRF",
      body: "Dense search (cosine over 768-dim vectors) catches cross-lingual meaning; two separate full-text columns (English, Vietnamese) catch exact keywords. All three rankings merge through Reciprocal Rank Fusion.",
    },
  },
  {
    n: "04",
    vi: {
      title: "Ngưỡng từ chối là bộ lọc thô, không phải bảo chứng",
      body: "Đo mở rộng thì phát hiện không tồn tại một ngưỡng cosine tối ưu — câu hỏi ngoài phạm vi nhưng cùng lĩnh vực chồng lấn với câu trong phạm vi. Bảo chứng thật nằm ở grounding prompt: bắt buộc trích dẫn, chỉ được trả lời từ ngữ cảnh được cấp.",
    },
    en: {
      title: "The refusal threshold is a coarse filter, not a guarantee",
      body: "Broader measurement found no optimal cosine cutoff exists — an out-of-scope-but-same-domain question overlaps with in-scope ones. The real guarantee is the grounding prompt: mandatory citations, answer only from the given context.",
    },
  },
] as const;

const TRAPS = [
  {
    n: 1,
    vi: { t: "Vision không tất định", d: "Cùng một trang, gọi ba lần, ba kết quả khác nhau — phát hiện ở bước spike, trước khi viết dòng code nào." },
    en: { t: "Vision is non-deterministic", d: "The same page, called three times, comes back three different ways — found during the spike, before a line of pipeline code existed." },
  },
  {
    n: 17,
    vi: { t: "Chỉ số bi quan sai", d: "Nhóm câu hỏi ngoài phạm vi trả lời bằng văn xuôi, không phải từ chối có cấu trúc — đếm nhầm loại làm một hệ thống đúng bị chấm sai." },
    en: { t: "A pessimistic metric, wrongly applied", d: "Out-of-scope answers came back as prose refusals, not structural ones — counting them the wrong way scored a correctly-behaving system as broken." },
  },
  {
    n: 21,
    vi: { t: "Trần 60 giây của nền tảng", d: "Hai câu chết ở 62 giây với thân rỗng. Bản vá đầu tiên — chỉ truyền abortSignal — không có tác dụng, vì provider không đọc nó." },
    en: { t: "The platform's 60-second ceiling", d: "Two questions died at 62 seconds with an empty body. The first fix — passing abortSignal alone — did nothing, because the provider never read it." },
  },
  {
    n: 24,
    vi: { t: "Đo lường tự đánh lừa mình", d: "p90 độ trễ 'tự khỏi' sau một đêm — không ai sửa gì về tốc độ. Nguyên nhân: thêm câu hỏi mới vào bộ eval đã lặng lẽ đổi mẫu đo." },
    en: { t: "A measurement fooling itself", d: "p90 latency 'healed itself' overnight — nobody touched anything about speed. Cause: adding new questions to the eval set had quietly changed what was being sampled." },
  },
  {
    n: 28,
    vi: { t: "Model không đọc được dữ liệu hình/bảng, từ ngày đầu", d: "51% chunk trong corpus giữ nguyên placeholder thay vì dữ liệu hình đã trích — không chỉ số nào bắt được suốt 15 lần chạy trước." },
    en: { t: "The model never saw figure data, since day one", d: "51% of chunks in the corpus kept a raw placeholder instead of the extracted figure data — no metric caught it across 15 prior runs." },
  },
  {
    n: 30,
    vi: { t: "Sửa một bên, quên bên song song", d: "Sửa lỗi #28 ở nơi model sinh câu trả lời, quên mất bộ chấm điểm có một bản dựng ngữ cảnh riêng — tự mắc lại đúng bài học vừa học 24 giờ trước." },
    en: { t: "Fixed one side, forgot its twin", d: "Fixed bug #28 where the model generates answers, forgot the scoring harness keeps its own separate copy of the same context-building logic — repeated the exact lesson learned 24 hours earlier." },
  },
] as const;

const NAV = [
  { href: "#architecture", vi: "Kiến trúc", en: "Architecture" },
  { href: "#stack", vi: "Công nghệ", en: "Stack" },
  { href: "#metrics", vi: "Đánh giá", en: "Metrics" },
  { href: "#lessons", vi: "Bài học", en: "Lessons" },
] as const;

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const [lang, setLang] = useState<Lang>("vi");

  useEffect(() => {
    const stored = localStorage.getItem("docubo-lang");
    if (stored === "vi" || stored === "en") setLang(stored);
  }, []);

  function setAndStore(next: Lang) {
    setLang(next);
    localStorage.setItem("docubo-lang", next);
  }

  const vi = lang === "vi";
  const appHref = signedIn ? "/app" : "/login";

  return (
    <div className="landing">
      <header className="l-topnav">
        <Link href="/" className="l-brand">
          <BrandMark />
          <span>Docubo</span>
        </Link>

        <nav className="l-nav">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {vi ? item.vi : item.en}
            </a>
          ))}
        </nav>

        <div className="l-topnav-actions">
          <div className="lang-switch" role="group" aria-label="Ngôn ngữ / Language">
            <button type="button" className={vi ? "is-active" : ""} onClick={() => setAndStore("vi")}>
              VI
            </button>
            <button type="button" className={!vi ? "is-active" : ""} onClick={() => setAndStore("en")}>
              EN
            </button>
          </div>
          <ThemeToggle />
          <a
            className="l-btn-ghost l-github"
            href="https://github.com/trantiendat0611/Docubo"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <Link className="l-btn-primary l-cta-small" href={appHref}>
            {signedIn ? (vi ? "Vào ứng dụng" : "Open app") : vi ? "Đăng nhập" : "Sign in"}
          </Link>
        </div>
      </header>

      <main>
        {/* ================= HERO ================= */}
        <section className="l-hero">
          <Reveal>
            <p className="l-eyebrow">{vi ? "ĐỒ ÁN · RAG SONG NGỮ" : "CAPSTONE · BILINGUAL RAG"}</p>
            <h1>
              {vi ? (
                <>Hỏi đáp tài liệu, có trích dẫn thật.</>
              ) : (
                <>Document Q&amp;A that cites what it actually read.</>
              )}
            </h1>
            <p className="l-lead">
              {vi
                ? "Docubo đọc PDF, DOCX, TXT và ảnh bằng vision thay vì lớp text — giữ nguyên công thức toán, biểu đồ, bảng dữ liệu. Mọi câu trả lời trích dẫn số trang, và từ chối khi tài liệu không có câu trả lời."
                : "Docubo reads PDF, DOCX, TXT and images through vision instead of a text layer — formulas, charts and tables survive intact. Every answer cites a page, and refuses when the document doesn't have the answer."}
            </p>

            <div className="l-hero-actions">
              <Link className="l-btn-primary" href={appHref}>
                {vi ? "Dùng thử ngay" : "Try it now"}
              </Link>
              <a className="l-btn-secondary" href="#architecture">
                {vi ? "Xem kiến trúc" : "See the architecture"}
              </a>
            </div>

            <div className="l-insight">
              <span className="l-insight-label">{vi ? "ĐIỂM MẤU CHỐT" : "THE ACTUAL PROBLEM"}</span>
              <p>
                <strong>{vi ? "Đọc được PDF mất mười phút." : "Reading a PDF takes ten minutes."}</strong>{" "}
                {vi
                  ? "Phần khó là giữ công thức toán và biểu đồ sống sót qua bước trích xuất, đo được cả hai đường tìm kiếm đúng ngôn ngữ, và biết chính xác khi nào nên từ chối thay vì đoán."
                  : "The hard part is keeping formulas and charts alive through extraction, measuring both retrieval languages honestly, and knowing exactly when to refuse instead of guessing."}
              </p>
            </div>
          </Reveal>

          <Reveal className="l-terminal-wrap">
            <div className="terminal">
              <div className="terminal-bar">
                <span /><span /><span />
                <span className="terminal-title">
                  {vi ? "eval — production, 34 câu" : "eval — production, 34 questions"}
                </span>
              </div>
              <pre>
                <code>{`$ python -m eval.run_eval --retrieval-only
mode=retrieval  items=34  MIN_COSINE=0.6

  t-001  text     cos=0.805  answer
  g-001  figure   cos=0.608  answer
  i-002  image    cos=0.826  answer
  r-002  should_refuse  cos=0.552  refuse

{
  "retrieval_hit_at_8": 1.0,
  "retrieval_mrr": 0.897,
  "hit_cross_lingual": 1.0,
  "false_refusal_rate": 0.0
}`}</code>
              </pre>
            </div>
          </Reveal>
        </section>

        {/* ================= STATS ================= */}
        <Reveal>
          <section className="l-stats">
            <div className="l-stat">
              <span className="v">1.000</span>
              <span className="l">hit@8</span>
            </div>
            <div className="l-stat">
              <span className="v">1.000</span>
              <span className="l">{vi ? "trúng xuyên ngôn ngữ" : "cross-lingual hit"}</span>
            </div>
            <div className="l-stat">
              <span className="v">8.6s</span>
              <span className="l">p50 TTFT</span>
            </div>
            <div className="l-stat">
              <span className="v">0đ</span>
              <span className="l">{vi ? "chi phí vận hành" : "operating cost"}</span>
            </div>
            <div className="l-stat">
              <span className="v">30</span>
              <span className="l">{vi ? "bẫy kỹ thuật đã ghi" : "engineering traps logged"}</span>
            </div>
          </section>
        </Reveal>

        {/* ================= ARCHITECTURE ================= */}
        <section id="architecture" className="l-section">
          <Reveal>
            <p className="l-kicker">{vi ? "BÊN TRONG" : "UNDER THE HOOD"}</p>
            <h2>{vi ? "Kiến trúc hệ thống" : "System architecture"}</h2>
            <p className="l-section-lead">
              {vi
                ? "Hai luồng: nạp tài liệu (vision → hai biểu diễn → chỉ mục) và trả lời câu hỏi (truy hồi hybrid → grounding → stream)."
                : "Two flows: ingest (vision → dual representation → index) and answer (hybrid retrieval → grounding → stream)."}
            </p>
          </Reveal>

          <Reveal>
            <figure className="arch-card wide">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/architecture/01-high-level.png" alt="Docubo high-level architecture" />
              <figcaption>
                <b>{vi ? "Sơ đồ 1" : "Diagram 1"}</b>
                {vi ? " — Tổng quan hệ thống" : " — System overview"}
              </figcaption>
            </figure>
          </Reveal>

          <Reveal>
            <figure className="arch-card wide">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/architecture/02-rag-pipeline.png" alt="Docubo RAG pipeline" />
              <figcaption>
                <b>{vi ? "Sơ đồ 2" : "Diagram 2"}</b>
                {vi ? " — Luồng RAG chi tiết" : " — Detailed RAG flow"}
              </figcaption>
            </figure>
          </Reveal>
        </section>

        {/* ================= DECISIONS ================= */}
        <section className="l-section">
          <Reveal>
            <p className="l-kicker">{vi ? "QUYẾT ĐỊNH" : "DECISIONS"}</p>
            <h2>{vi ? "Bốn quyết định thiết kế cốt lõi" : "Four core design decisions"}</h2>
          </Reveal>
          <div className="l-decisions">
            {DECISIONS.map((d) => (
              <Reveal key={d.n}>
                <article className="decision-card">
                  <span className="decision-n">{d.n}</span>
                  <h3>{vi ? d.vi.title : d.en.title}</h3>
                  <p>{vi ? d.vi.body : d.en.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================= STACK ================= */}
        <section id="stack" className="l-section">
          <Reveal>
            <p className="l-kicker">{vi ? "THÀNH PHẦN" : "COMPONENTS"}</p>
            <h2>{vi ? "Stack công nghệ" : "Technology stack"}</h2>
          </Reveal>
          <div className="l-stack-grid">
            {STACK.map((s) => (
              <Reveal key={s.name}>
                <a className="tech-card" href={s.href} target="_blank" rel="noreferrer">
                  <span className="tech-group">{vi ? s.group.vi : s.group.en}</span>
                  <h3>{s.name}</h3>
                  <p>{vi ? s.detail.vi : s.detail.en}</p>
                  <div className="tech-tags">
                    {s.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================= METRICS ================= */}
        <section id="metrics" className="l-section">
          <Reveal>
            <p className="l-kicker">{vi ? "QUAN SÁT" : "OBSERVED"}</p>
            <h2>{vi ? "Chỉ số nghiệm thu" : "Acceptance metrics"}</h2>
            <p className="l-section-lead">
              {vi
                ? "Đo trên production, 34 câu hỏi (7 nhóm, kể cả câu hỏi ngoài phạm vi cùng lĩnh vực và câu hỏi trên ảnh dán). Mỗi con số ghi kèm chế độ chạy — một kỷ luật giữ từ bẫy #24."
                : "Measured on production, 34 questions across 7 categories, including same-domain out-of-scope questions and pasted-image questions. Every number is tagged with the run mode it came from — a discipline kept since trap #24."}
            </p>
          </Reveal>
          <Reveal>
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-v">1.000</span>
                <span className="metric-l">retrieval_hit_at_8</span>
                <span className="metric-target">{vi ? "mục tiêu ≥ 0.85" : "target ≥ 0.85"}</span>
              </div>
              <div className="metric">
                <span className="metric-v">1.000</span>
                <span className="metric-l">citation_validity</span>
                <span className="metric-target">{vi ? "mục tiêu ≥ 0.95" : "target ≥ 0.95"}</span>
              </div>
              <div className="metric">
                <span className="metric-v">1.000</span>
                <span className="metric-l">refusal_rate</span>
                <span className="metric-target">{vi ? "mục tiêu ≥ 0.90" : "target ≥ 0.90"}</span>
              </div>
              <div className="metric">
                <span className="metric-v">8592ms</span>
                <span className="metric-l">median_ttft_ms</span>
                <span className="metric-target">{vi ? "mục tiêu < 10s — đạt" : "target < 10s — met"}</span>
              </div>
              <div className="metric is-unmet">
                <span className="metric-v">15879ms</span>
                <span className="metric-l">p90_ttft_ms</span>
                <span className="metric-target">
                  {vi ? "mục tiêu < 15s — chưa đạt" : "target < 15s — not met"}
                </span>
              </div>
              <div className="metric">
                <span className="metric-v">0</span>
                <span className="metric-l">n_timeout</span>
                <span className="metric-target">{vi ? "mục tiêu = 0 — đạt" : "target = 0 — met"}</span>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ================= LESSONS ================= */}
        <section id="lessons" className="l-section">
          <Reveal>
            <p className="l-kicker">{vi ? "HỌC ĐƯỢC GÌ" : "WHAT IT TAUGHT"}</p>
            <h2>{vi ? "Sáu bẫy đáng kể nhất" : "Six traps worth telling"}</h2>
            <p className="l-section-lead">
              {vi
                ? "Chọn từ 30 bẫy đã ghi có hệ thống trong SKILL_MY_PROJECT.md — mỗi cái là một bài học rộng hơn chính bản thân nó."
                : "Picked from 30 traps logged systematically in SKILL_MY_PROJECT.md — each one taught something bigger than itself."}
            </p>
          </Reveal>
          <div className="l-lessons">
            {TRAPS.map((t) => (
              <Reveal key={t.n}>
                <article className="lesson-card">
                  <span className="lesson-n">{String(t.n).padStart(2, "0")}</span>
                  <h3>{vi ? t.vi.t : t.en.t}</h3>
                  <p>{vi ? t.vi.d : t.en.d}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-footer-brand">
          <BrandMark />
          <span>Docubo</span>
        </div>
        <div className="l-footer-links">
          <a href="https://github.com/trantiendat0611/Docubo" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://docubo.vercel.app" target="_blank" rel="noreferrer">
            {vi ? "Ứng dụng đang chạy" : "Live app"}
          </a>
          <Link href={appHref}>{signedIn ? (vi ? "Vào ứng dụng" : "Open app") : vi ? "Đăng nhập" : "Sign in"}</Link>
        </div>
        <p className="l-footer-note">
          {vi
            ? "Đồ án cuối kì thực tập AI Engineer. Toàn bộ hạ tầng chạy trên free tier."
            : "AI Engineer internship capstone. The entire stack runs on free tiers."}
        </p>
      </footer>
    </div>
  );
}
