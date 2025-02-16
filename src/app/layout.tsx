import { Geist, Geist_Mono } from 'next/font/google'

import { RootLayoutClient } from './layout.client'

import type { Metadata } from 'next'

import './globals.css'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
})

export const metadata: Metadata = {
    title: 'Screen Sharing Pair',
    description: 'Pair your device with a 6-digit access code',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="en" className="dark">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <RootLayoutClient>{children}</RootLayoutClient>
            </body>
        </html>
    )
}
