import type { Metadata } from "next";
import { DevMenuModal } from "./dev-menu-modal";
import { devToolsEnabled } from "@/server/dev/guard";

export const metadata: Metadata = {
  title: "Developer Console — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default function DevPage() {
  if (!devToolsEnabled()) {
    return (
      <main style={{ minHeight: "100vh", padding: "40px 20px", display: "flex", justifyContent: "center" }}>
        <div className="card card-wide" style={{ width: "100%", maxWidth: "800px" }}>
          <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Developer tools are disabled</h1>
          <p className="muted">
            This build runs in production mode. Developer tools are available only in
            development, or when the application is started with{" "}
            <code>GMS_ENABLE_DEV_MENU=1</code>.
          </p>
          <p style={{ marginTop: 16 }}>
            <a href="/login" className="btn-secondary">
              Back to sign in
            </a>
          </p>
        </div>
      </main>
    );
  }
  return (
    <main style={{ minHeight: "100vh", padding: "40px 20px", display: "flex", justifyContent: "center" }}>
      <div className="card card-wide" style={{ width: "100%", maxWidth: "800px" }}>
        <h1 style={{ fontSize: "24px", color: "#38bdf8", marginBottom: "8px" }}>
          🛠 Developer Console
        </h1>
        <p className="muted" style={{ marginBottom: "20px" }}>
          Use the Developer Menu below to manage administrator accounts, delete users, or run the first-time setup wizard manually.
        </p>
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          <a href="/login" className="btn-secondary">← Back to Sign In</a>
          <a href="/setup" className="btn">Open Setup Wizard (/setup)</a>
        </div>
        <DevMenuModal />
      </div>
    </main>
  );
}
