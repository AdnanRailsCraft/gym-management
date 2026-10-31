import type { Metadata } from "next";
import Image from "next/image";
import { getDb } from "@/server/db/connection";
import { ownerExists } from "@/server/users/service";
import { devToolsEnabled } from "@/server/dev/guard";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = {
  title: "First-run setup — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const db = getDb();
  const hasOwner = ownerExists(db);

  if (hasOwner) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div className="card card-wide" style={{ maxWidth: "600px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
            <Image src="/branding/logo-256.png" alt="Empire Fitness" width={48} height={48} style={{ borderRadius: "10px" }} />
            <div>
              <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Setup Already Completed</h1>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>
                An active Owner account already exists in the system.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
            <a href="/login" className="btn-primary" style={{ textDecoration: "none" }}>
              ← Return to Sign In
            </a>
            {devToolsEnabled() ? (
              <a href="/dev" className="btn-secondary" style={{ textDecoration: "none" }}>
                Developer Console
              </a>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="card card-wide" style={{ maxWidth: "680px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
          <Image src="/branding/logo-256.png" alt="Empire Fitness" width={48} height={48} style={{ borderRadius: "10px" }} />
          <div>
            <h1 style={{ fontSize: "1.4rem", margin: 0 }}>First-Run System Setup</h1>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>
              Configure your gym profile and create the master Owner account.
            </p>
          </div>
        </div>
        <SetupForm />
      </div>
    </main>
  );
}
