import { redirect } from "next/navigation";

export default function Home() {
  // Middleware will bounce unauthenticated users to /login.
  redirect("/dashboard");
}
