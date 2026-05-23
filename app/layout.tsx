import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "@livekit/components-styles";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationListener } from "@/components/NotificationListener";
import { getCurrentUser } from "@/lib/current-user";
import { Providers } from "./Providers";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scribbl",
  description: "Collaborative workspaces for teams, classes, and projects.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const darkMode = user?.darkMode ?? false;

  return (
    <html
      lang="en"
      data-theme={darkMode ? "dark" : undefined}
      className={`h-full antialiased ${hankenGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <CommandPalette />
        <NotificationListener />
      </body>
    </html>
  );
}
