"use client";

// Reads the Trello token from the URL fragment, scrubs it from the address bar
// IMMEDIATELY (history.replaceState — the pre-scrub history entry is an
// accepted residual risk, spec 2026-06-12 §12.15), POSTs it to the
// session-bound capture endpoint (which verifies it against /1/members/me
// before persisting), then returns to /connectors.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/provider";
import { connectors as dict } from "@/i18n/dictionaries/connectors";

export default function TrelloCaptureClient() {
  const router = useRouter();
  const t = useT(dict);
  const ran = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return; // strict-mode double-invoke guard
    ran.current = true;

    const hash = window.location.hash; // "#token=…" (or "#error=…" on deny)
    window.history.replaceState(null, "", window.location.pathname);

    const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
    if (!token) {
      router.replace("/connectors?error=oauth_denied");
      return;
    }
    void (async () => {
      try {
        const r = await fetch("/api/connectors/trello/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (r.ok && j.ok) {
          router.replace("/connectors?connected=trello");
        } else {
          setFailed(j.error || "");
          router.replace("/connectors?error=oauth_exchange");
        }
      } catch {
        setFailed("");
        router.replace("/connectors?error=oauth_exchange");
      }
    })();
  }, [router]);

  return (
    <main className="grid min-h-[60vh] place-items-center p-6">
      <p className="text-sm text-neutral-500" role="status">
        {failed === null ? t("conn.trelloFinishing") : t("conn.testErr")}
      </p>
    </main>
  );
}
