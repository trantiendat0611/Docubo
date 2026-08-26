"use client";

import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const { t } = useLang();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-compact"
      onClick={async () => {
        await browserClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      {t.nav.signOut}
    </button>
  );
}
