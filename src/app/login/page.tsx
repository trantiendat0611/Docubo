"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = browserClient();
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "signup") {
      // With email confirmation enabled in the Supabase project, there is no
      // session yet and the user has to click a link first.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMessage("Kiểm tra email để xác nhận tài khoản, rồi đăng nhập.");
        return;
      }
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>Docubo</h1>
        <p className="lead">
          {mode === "signin"
            ? "Đăng nhập để hỏi tài liệu của bạn."
            : "Tạo tài khoản để bắt đầu tải tài liệu lên."}
        </p>

        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
          />

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Đang xử lí…" : mode === "signin" ? "Đăng nhập" : "Đăng ký"}
          </button>
        </form>

        {message && (
          <p className="note note-error" role="alert">
            {message}
          </p>
        )}

        <p className="auth-alt">
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage(null);
            }}
          >
            {mode === "signin"
              ? "Chưa có tài khoản? Đăng ký"
              : "Đã có tài khoản? Đăng nhập"}
          </button>
        </p>
      </div>
    </main>
  );
}
