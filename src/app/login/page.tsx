"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle } from "@/components/LangToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLang } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Two different things end up here: a Supabase failure, and the note telling
  // a new user to go confirm their email. Styling both as an error told people
  // their successful signup had failed.
  const [message, setMessage] = useState<{
    text: string;
    kind: "info" | "error";
  } | null>(null);
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
      setMessage({ text: error.message, kind: "error" });
      return;
    }

    if (mode === "signup") {
      // With email confirmation enabled in the Supabase project, there is no
      // session yet and the user has to click a link first.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMessage({
          text: t.login.signupConfirm,
          kind: "info",
        });
        return;
      }
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <main className="auth">
      <div className="auth-toolbar">
        <LangToggle />
        <ThemeToggle />
      </div>

      <div className="auth-card">
        <Link href="/" className="brand-mark-link">
          <span className="brand-mark">
            <BrandMark size={26} />
          </span>
          <h1>Docubo</h1>
        </Link>
        <p className="lead">{mode === "signin" ? t.login.signInLead : t.login.signUpLead}</p>

        <form onSubmit={submit}>
          <label htmlFor="email">{t.login.email}</label>
          <input
            id="email"
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">{t.login.password}</label>
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
            {busy ? t.login.submitBusy : mode === "signin" ? t.nav.signIn : t.nav.signUp}
          </button>
        </form>

        {message && (
          <p
            className={
              message.kind === "error" ? "note note-error" : "note note-success"
            }
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}

        <p className="auth-alt">
          <span className="auth-alt-prompt">
            {mode === "signin" ? t.login.noAccount : t.login.hasAccount}
          </span>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage(null);
            }}
          >
            {mode === "signin" ? t.nav.signUp : t.nav.signIn}
          </button>
        </p>
      </div>
    </main>
  );
}
