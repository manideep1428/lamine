import type { Metadata, Viewport } from "next"
import { Fredoka, JetBrains_Mono, Outfit } from "next/font/google"

import "./globals.css"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { cn } from "@/lib/utils"

/* Fredoka for display, Outfit for body, JetBrains for code. Rounded and warm,
   picked for readers aged 8-14 rather than for a dashboard. */
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
})

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Lamine — build websites and games with blocks",
  description:
    "Snap blocks together to describe what you want, then watch your helpers build a real website or game you can play.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/logo.png",
  },
  openGraph: {
    title: "Lamine",
    description:
      "Snap blocks together to describe what you want, then watch your helpers build a real website or game you can play.",
    images: ["/logo.png"],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f4",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        fredoka.variable,
        outfit.variable,
        jetbrains.variable
      )}
    >
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  )
}
