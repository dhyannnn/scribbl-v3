import type { Metadata } from "next";
import "@livekit/components-styles";
import { Providers } from "./Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scribbl",
  description: "Collaborative study workspaces for students and tutoring centers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
