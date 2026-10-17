import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Axomir - Autonomous eXpert Oral Mock Interview Responder",
  description: "Agentic first-round screening interviews with human review.",
  icons: {
    icon: "/axomir-ai-interviewer-logo.png",
    apple: "/axomir-ai-interviewer-logo.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
