import { AuthProvider } from "@/auth/auth";
import AppView from "@/components/layout/view";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fontSans = localFont({
  src: "../assets/fonts/Anthropic-Sans-Regular-Web.woff2",
  variable: "--font-sans",
});

const fontSansItalic = localFont({
  src: "../assets/fonts/Anthropic-Sans-Regular-Italic-Web.woff2",
  variable: "--font-sans-italic",
});

const fontSerif = localFont({
  src: "../assets/fonts/Anthropic-Serif-Regular-Web.woff2",
  variable: "--font-serif",
});

const fontSerifItalic = localFont({
  src: "../assets/fonts/Anthropic-Serif-Regular-Italic-Web.woff2",
  variable: "--font-serif-italic",
});

const fontMono = localFont({
  src: "../assets/fonts/Anthropic-Mono-Variable-Regular.woff2",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "TheAtlas — Youtube Agent",
  description: "Youtube Agent for video processing utilities.",
  authors: [{ name: "atlasata" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontSansItalic.variable} ${fontMono.variable} ${fontSerif.variable} ${fontSerifItalic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SidebarProvider className="flex-1">
            <AppView>{children}</AppView>
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
