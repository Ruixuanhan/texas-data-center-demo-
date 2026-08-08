import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar/TX — live energy project intelligence",
  description:
    "Live map of Texas energy capital projects — interconnection queues, permits, dockets, and press stitched into one addictive screen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
