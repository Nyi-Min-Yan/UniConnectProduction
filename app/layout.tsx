import type { Metadata } from "next";
import "./globals.css";
import Toaster from "@/components/shared/Toaster";
import { SessionProvider } from "@/components/shared/SessionProvider";
import { PresenceProvider } from "@/components/shared/PresenceProvider";
import { SocketProvider } from "@/lib/realtime/context";

export const metadata: Metadata = {
  title: "UniConnect - University Communication Platform",
  description: "University communication and management platform",
};

const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('uniconnect-theme');
  document.documentElement.dataset.theme = (t === 'dark' || t === 'ocean-dark') ? 'ocean-dark' : 'ocean-light';
} catch (e) {}
`;

const SW_CLEANUP_SCRIPT = `
try {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      if (regs.length) regs.forEach(function (reg) { reg.unregister(); });
    });
  }
} catch (e) {}
try {
  if (window.caches) {
    caches.keys().then(function (keys) {
      if (keys.length) keys.forEach(function (k) { caches.delete(k); });
    });
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SW_CLEANUP_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Patrick+Hand&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen" style={{ fontFamily: "'Poppins', sans-serif" }}>
        <SessionProvider>
          <SocketProvider>
            <PresenceProvider>{children}</PresenceProvider>
          </SocketProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}