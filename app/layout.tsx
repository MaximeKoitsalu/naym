import type { Metadata, Viewport } from "next";
import { Fraunces, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import BottomNav from "@/components/BottomNav";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT", "WONK"],
});

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
});

export const metadata: Metadata = {
  title: "naym — find a name you both love",
  description:
    "Pick your favorites in secret. Share one link. See only the names you both chose.",
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the bottom nav pad for the home indicator
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${schibsted.variable}`}>
      <body>
        <div className="stage">{children}</div>
        {/* useSearchParams needs a Suspense boundary. */}
        <Suspense>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
