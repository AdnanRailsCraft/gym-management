import type { Metadata } from "next";
import Image from "next/image";
import { getDb } from "@/server/db/connection";
import { ownerExists } from "@/server/users/service";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const hasOwner = ownerExists(getDb());

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="card" style={{ maxWidth: "440px", padding: "36px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <Image
            src="/branding/logo-256.png"
            alt="Empire Fitness"
            width={64}
            height={64}
            priority
            style={{ borderRadius: "12px", marginBottom: "12px" }}
          />
          <h1 style={{ fontSize: "1.5rem", marginBottom: "4px" }}>Empire Fitness</h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Desktop Gym Management System
          </p>
        </div>

        {!hasOwner && (
          <div
            style={{
              padding: "12px 14px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "10px",
              marginBottom: "20px",
              fontSize: "13px",
              color: "#1e40af",
              textAlign: "center",
            }}
          >
            <strong>First time launch:</strong> No admin account has been created yet.
            <div style={{ marginTop: "8px", display: "flex", justifyContent: "center", gap: "10px" }}>
              <a href="/setup" style={{ fontWeight: 700, textDecoration: "underline", color: "#1d4ed8" }}>
                Run Setup Wizard (/setup)
              </a>
              <span>·</span>
              <a href="/dev" style={{ textDecoration: "underline", color: "#3b82f6" }}>
                Dev Console
              </a>
            </div>
          </div>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
