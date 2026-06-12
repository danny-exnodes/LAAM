import type { Metadata } from "next";
import TrelloCaptureClient from "@/components/connectors/TrelloCaptureClient";

// Trello authorize accelerator landing — Trello redirects here with the user
// token in the URL FRAGMENT (#token=…), which only client JS can read (spec
// 2026-06-12 §4). No referrer leaves this page and it loads no third-party
// scripts: the fragment's only journey is location.hash → same-origin POST.
export const metadata: Metadata = {
  title: "Kết nối Trello — LAAM",
  referrer: "no-referrer",
  robots: { index: false },
};

export default function TrelloCallbackPage() {
  return <TrelloCaptureClient />;
}
