"use client";

import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="link"
      onClick={async () => {
        await browserClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      Đăng xuất
    </button>
  );
}
