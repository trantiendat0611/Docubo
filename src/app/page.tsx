import { redirect } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";
import { SignOutButton } from "@/components/SignOutButton";
import { currentUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <main>
      <header>
        <div className="header-row">
          <h1>Docubo</h1>
          <div className="who">
            <span>{user.email}</span>
            <SignOutButton />
          </div>
        </div>
        <p>
          Hỏi đáp tài liệu chuyên ngành tiếng Việt và tiếng Anh. Mọi câu trả lời
          đều dựa trên tài liệu bạn đã tải lên và có trích dẫn số trang.
        </p>
      </header>
      <ChatPanel />
    </main>
  );
}
