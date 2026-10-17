import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interviewer UC2",
  description: "Agentic first-round screening interviews with human review."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
