import { LandingPage } from "@/components/LandingPage";
import { currentUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await currentUser();
  return <LandingPage signedIn={Boolean(user)} />;
}
