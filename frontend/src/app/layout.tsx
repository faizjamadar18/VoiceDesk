import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dock.css";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.voiceos.com"),
  title: "VoiceOS - AI Voice Agent and Dictation for Mac and Windows",
  description:
    "VoiceOS is a voice operating system and AI voice assistant for Mac and Windows that turns voice to action: dictate, send messages, search the web, and automate tasks across apps with your voice.",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "VoiceOS - AI Voice Agent and Dictation for Mac and Windows",
    description:
      "VoiceOS is a voice operating system that turns voice to action. The AI voice assistant for Mac and Windows turns speech into polished writing and real actions across apps.",
    url: "https://www.voiceos.com",
    siteName: "VoiceOS",
    images: [
      {
        url: "/voiceOsOpenGraph.png",
        width: 1200,
        height: 630,
        alt: "VoiceOS",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VoiceOS - AI Voice Agent and Dictation for Mac and Windows",
    description:
      "VoiceOS is a voice operating system that turns voice to action. The AI voice assistant for Mac and Windows turns speech into polished writing and real actions across apps.",
    images: ["/voiceOsTwitter.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased scroll-smooth">
      <body className="min-h-full flex flex-col bg-white text-gray-900 selection:bg-blue-100 selection:text-blue-900">
        {children}
      </body>
    </html>
  );
}
