'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase.client'

import { cleanupChannel, setupChannel } from './channel'

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

interface ChannelState {
    isConnected: boolean
    error: string | null
    pairingCode: string | null
}

interface ChannelContextType {
    state: ChannelState
    connect: (pairingCode: string) => Promise<void>
    disconnect: () => void
    getChannel: () => RealtimeChannel | null
}

const ChannelContext = createContext<ChannelContextType | null>(null)

const initialState: ChannelState = {
    isConnected: false,
    error: null,
    pairingCode: null,
}

export function ChannelProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ChannelState>(initialState)
    const channelRef = useRef<RealtimeChannel | null>(null)
    const [supabase] = useState(() => createClient())

    const connect = useCallback(
        async (pairingCode: string) => {
            console.log('🔌 [Channel] Connecting:', { pairingCode })

            if (channelRef.current) {
                console.log('📡 [Channel] Already connected')
                return
            }

            try {
                // Use our existing setupChannel logic which handles subscription
                const channel = await setupChannel(supabase, pairingCode)
                channelRef.current = channel

                setState(prev => ({
                    ...prev,
                    isConnected: true,
                    pairingCode,
                    error: null,
                }))

                // Monitor channel state changes
                channel.on('system', { event: '*' }, ({ eventType }) => {
                    if (eventType === 'disconnect') {
                        setState(prev => ({
                            ...prev,
                            isConnected: false,
                            error: 'Channel disconnected',
                        }))
                    }
                })
            } catch (error) {
                console.error('❌ [Channel] Connection error:', error)
                setState(prev => ({
                    ...prev,
                    error: 'Failed to connect to channel',
                    isConnected: false,
                }))
            }
        },
        [supabase],
    )

    const disconnect = useCallback(() => {
        console.log('🔌 [Channel] Disconnecting')
        if (channelRef.current) {
            cleanupChannel(supabase, channelRef.current)
            channelRef.current = null
            setState(initialState)
        }
    }, [supabase])

    const getChannel = useCallback(() => channelRef.current, [])

    return (
        <ChannelContext.Provider
            value={{
                state,
                connect,
                disconnect,
                getChannel,
            }}
        >
            {children}
        </ChannelContext.Provider>
    )
}

export function useChannel() {
    const context = useContext(ChannelContext)
    if (!context) {
        throw new Error('useChannel must be used within a ChannelProvider')
    }
    return context
}
