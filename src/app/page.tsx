import { ChatPanel } from "@/components/ChatPanel";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Docubo</h1>
        <p>
          Hỏi đáp tài liệu chuyên ngành tiếng Việt và tiếng Anh. Mọi câu trả lời
          đều dựa trên tài liệu đã nạp và có trích dẫn số trang.
        </p>
      </header>
      <ChatPanel />
    </main>
  );
}
