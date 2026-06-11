import type { Metadata, Viewport } from "next";
import { auth } from "@/auth";
import { Landing } from "@/components/landing/Landing";

// Public marketing page: real description for crawlers/share cards (cnt-9)…
export const metadata: Metadata = {
  title: "LAAM — Giám sát Claude agent local-first · chat AI $0 · workflow",
  description:
    "Theo dõi real-time các Claude agent trên mọi máy dev — không cần sửa agent. Trợ lý AI chạy local $0, connectors mã hoá khi lưu trữ, workflow tự động hoá. Tất cả trên phần cứng của bạn.",
};
// …and unlike the app shell, pinch zoom STAYS available here (WCAG 1.4.4).
// The app-wide zoom lock (layout.tsx + NoZoom) is a deliberate app-like-feel
// decision and is NOT changed by this route-level override.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

// Public marketing landing page, shown to everyone at `/` (see auth.config.ts
// isPublic). Reads the session only to flip the nav CTA between
// "Get started / Sign in" (logged out) and "Go to dashboard" (logged in).
export default async function Home() {
  const session = await auth();
  return <Landing isAuthed={Boolean(session?.user)} />;
}
