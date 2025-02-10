'use client'

import { ChannelProvider } from '@/hooks/session/ChannelContext'

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
    return <ChannelProvider>{children}</ChannelProvider>
}
