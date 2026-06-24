import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Daily Chief of Staff",
  description: "Your personal AI chief of staff — goals, priorities, and a daily rhythm.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-paper text-ink">
          <NavBar />
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
