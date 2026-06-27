"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";

const links = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/goals", label: "Goals" },
  { href: "/daily", label: "Daily Loop" },
  { href: "/weekly", label: "Weekly Review" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[#e8e6e1] bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-ink">
          🗂️ Daily Chief of Staff
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "rounded-md px-3 py-1.5 transition-colors " +
                  (active
                    ? "bg-accent text-white"
                    : "text-ink/70 hover:bg-[#f1efe9]")
                }
              >
                {link.label}
              </Link>
            );
          })}

          <div className="ml-2 flex items-center gap-2 border-l border-[#e8e6e1] pl-3">
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="btn-primary px-3 py-1.5 text-sm">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </nav>
      </div>
    </header>
  );
}
