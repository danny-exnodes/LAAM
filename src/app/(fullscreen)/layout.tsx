import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import { auth } from "@/auth";

const chakra = Chakra_Petch({ subsets: ["latin", "vietnamese"], weight: ["300", "400", "500", "600"], variable: "--font-chakra" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plexmono" });

export default async function FullscreenLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <div className={`${chakra.variable} ${mono.variable}`}>{children}</div>;
}
