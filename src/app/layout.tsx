import type { Metadata } from "next";
import { headers } from "next/headers";
import { checkGate } from "@/server/security/token";
import { DevMenuModal } from "./dev/dev-menu-modal";
import { devToolsEnabled } from "@/server/dev/guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Empire Fitness — Gym Management System",
  description: "Local desktop gym management application",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Defense in depth: middleware gates every request; the layout re-checks
  // so a middleware misconfiguration cannot expose server-rendered data.
  const h = await headers();
  const gate = checkGate({
    method: "GET",
    authorization: null,
    cookie: h.get("cookie"),
    origin: null,
    host: h.get("host"),
  });
  if (!gate.ok) {
    throw new Error(`Unauthorized: ${gate.message}`);
  }

  return (
    <html lang="en">
      <body>
        {children}
        {devToolsEnabled() ? <DevMenuModal /> : null}
      </body>
    </html>
  );
}
