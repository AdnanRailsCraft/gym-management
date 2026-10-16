import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Empire Fitness",
};

export default function LoginPage() {
  return (
    <main>
      <div className="card">
        <div className="brand">
          <Image src="/branding/logo-256.png" alt="Empire Fitness" width={48} height={48} />
          <h1>Empire Fitness — Sign in</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
