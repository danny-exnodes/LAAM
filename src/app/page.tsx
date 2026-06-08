import { auth } from "@/auth";
import { Landing } from "@/components/landing/Landing";

// Public marketing landing page, shown to everyone at `/` (see auth.config.ts
// isPublic). Reads the session only to flip the nav CTA between
// "Get started / Sign in" (logged out) and "Go to dashboard" (logged in).
export default async function Home() {
  const session = await auth();
  return <Landing isAuthed={Boolean(session?.user)} />;
}
