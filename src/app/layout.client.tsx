'use client'

import { ChannelProvider } from '@/contexts/channel-context'

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
    return <ChannelProvider>{children}</ChannelProvider>
}
