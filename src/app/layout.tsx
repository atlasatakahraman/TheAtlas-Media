// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppView from "@/layout/view/AppView";

import { ThemeProvider } from "@/components/theme-provider";

const sans = localFont({
	src: "../fonts/sans-regular.woff2",
	variable: "--font-sans",
});

const sans_italic = localFont({
	src: "../fonts/sans-italic.woff2",
	variable: "--font-sans-italic",
});

const mono = localFont({
	src: "../fonts/mono-variable.woff2",
	variable: "--font-mono",
});

const mono_italic = localFont({
	src: "../fonts/mono-variable-italic.woff2",
	variable: "--font-mono-italic",
});

const serif = localFont({
	src: "../fonts/serif-regular.woff2",
	variable: "--font-serif",
});

const serif_italic = localFont({
	src: "../fonts/serif-italic.woff2",
	variable: "--font-serif-italic",
});

export const metadata: Metadata = {
	title: "TheAtlas Media",
	description: "A local-first workspace for downloading, extracting, and converting media.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning={true}
			className={`${sans.variable} ${sans_italic.variable} ${mono.variable} ${mono_italic.variable} ${serif.variable} ${serif_italic.variable} h-full antialiased`}
		>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){window.addEventListener('contextmenu',function(e){if(!window.__CUSTOM_CONTEXT_MENU_ACTIVE__){e.preventDefault();}},true);})();`,
					}}
				/>
			</head>
			<body className="min-h-full flex flex-col overflow-hidden">
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem={true}
					disableTransitionOnChange={true}
				>
					<AppView>{children}</AppView>
				</ThemeProvider>
			</body>
		</html>
	);
}
