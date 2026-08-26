import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle } from "@/components/LangToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Workspace } from "@/components/Workspace";
import { currentUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="mark">
            <BrandMark />
          </span>
          <h1>Docubo</h1>
        </Link>
        <div className="who">
          <span className="email" title={user.email}>
            {user.email}
          </span>
          <LangToggle />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <Workspace />
    </main>
  );
}
