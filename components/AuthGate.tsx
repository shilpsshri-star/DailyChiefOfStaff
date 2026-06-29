"use client";

import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function AuthGate({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="card flex flex-col items-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="max-w-sm text-sm text-ink/70">{description}</p>
          <SignInButton mode="modal" fallbackRedirectUrl={pathname}>
            <button className="btn-primary px-4 py-2">
              Continue with Google or LinkedIn
            </button>
          </SignInButton>
          <p className="text-xs text-ink/40">
            No password, ever. Your goals and tasks from Onboarding carry
            straight over once you sign in.
          </p>
        </div>
      </SignedOut>
    </>
  );
}
