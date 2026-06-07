import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "@livekit/components-styles";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationListener } from "@/components/NotificationListener";
import { IncomingCallListenerLoader } from "@/components/IncomingCallListenerLoader";
import { ActiveMeetingProvider } from "@/components/ActiveMeetingContext";
import { AppVideoOverlay } from "@/components/AppVideoOverlay";
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
  metadataBase: new URL("https://scribblapp.ca"),
  title: {
    default: "Scribbl — Collaborative Workspaces for Teams & Students",
    template: "%s | Scribbl",
  },
  description: "Scribbl is an all-in-one collaborative workspace — notes, whiteboards, meetings, chat, and files in one place. Built for teams, students, and classrooms.",
  keywords: ["collaborative workspace", "team notes", "online whiteboard", "collaborative notes", "student workspace", "team meetings", "scribbl"],
  openGraph: {
    title: "Scribbl — Collaborative Workspaces for Teams & Students",
    description: "Scribbl is an all-in-one collaborative workspace — notes, whiteboards, meetings, chat, and files in one place.",
    url: "https://scribblapp.ca",
    siteName: "Scribbl",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scribbl — Collaborative Workspaces for Teams & Students",
    description: "Scribbl is an all-in-one collaborative workspace — notes, whiteboards, meetings, chat, and files in one place.",
  },
  icons: {
    icon: "/scribbl-logo.png",
    apple: "/scribbl-logo.png",
  },
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
        <ActiveMeetingProvider>
          <Providers>{children}</Providers>
          <CommandPalette />
          <NotificationListener />
          {user ? <IncomingCallListenerLoader currentUserId={user.id} /> : null}
          <AppVideoOverlay />
        </ActiveMeetingProvider>
      </body>
    </html>
  );
}
