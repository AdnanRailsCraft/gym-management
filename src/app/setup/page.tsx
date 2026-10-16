import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/connection";
import { ownerExists } from "@/server/users/service";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = {
  title: "First-run setup — Empire Fitness",
};

// ownerExists() reads SQLite; without cookies/headers Next would try to
// static-render this at build time.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (ownerExists(getDb())) redirect("/login");
  return (
    <main>
      <div className="card card-wide">
        <div className="brand">
          <Image src="/branding/logo-256.png" alt="Empire Fitness" width={48} height={48} />
          <h1>First-run setup</h1>
        </div>
        <p className="muted">
          Create the owner account and confirm gym details. This runs once.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
