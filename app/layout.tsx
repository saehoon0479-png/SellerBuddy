import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SellerBuddy - Etsy Listing Generator',
  description: 'AI-powered Etsy listing optimization for sellers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
