'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase.client'

import { cleanupChannel, setupChannel } from '../hooks/session/channel'

import type { Enums } from '@/lib/supabase.types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

type RecordingSessionType = Enums<'recording_session_type'>

interface ChannelState {
    isConnected: boolean
    error: string | null
    pairingCode: string | null
    sessionType: RecordingSessionType | null
}

interface ChannelContextType {
    state: ChannelState
    connect: (pairingCode: string) => Promise<void>
    disconnect: () => void
    getChannel: () => RealtimeChannel | null
    handlePairDevice: (code: string) => Promise<void>
}

const ChannelContext = createContext<ChannelContextType | null>(null)

const initialState: ChannelState = {
    isConnected: false,
    error: null,
    pairingCode: null,
    sessionType: null,
}

export function ChannelProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ChannelState>(initialState)
    const channelRef = useRef<RealtimeChannel | null>(null)
    const [supabase] = useState(() => createClient())

    const connect = useCallback(
        async (pairingCode: string) => {
            console.log('🔌 [Channel] Connecting:', { pairingCode })

            if (pairingCode.length !== 6) {
                console.error(
                    '❌ [Channel] Invalid pairing code length:',
                    pairingCode.length,
                )
                throw new Error('Please enter a complete pairing code')
            }

            if (channelRef.current) {
                console.log('📡 [Channel] Already connected')
                return
            }

            try {
                // Use our existing setupChannel logic which handles subscription
                const channel = await setupChannel(
                    supabase,
                    pairingCode,
                    setState,
                )

                channelRef.current = channel
                setState(prev => ({
                    ...prev,
                    isConnected: true,
                    pairingCode,
                    error: null,
                }))

                console.log(
                    '✅ [Channel] Setup complete, waiting for session type',
                )
            } catch (error) {
                console.error('❌ [Channel] Connection error:', error)
                setState(prev => ({
                    ...prev,
                    error: 'Failed to connect to channel',
                    isConnected: false,
                    sessionType: null,
                }))
                throw error
            }
        },
        [supabase],
    )

    const handlePairDevice = useCallback(
        async (code: string) => {
            try {
                await connect(code)
            } catch (error) {
                console.error('❌ [Channel] Failed to pair device:', error)
                throw error
            }
        },
        [connect],
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
                handlePairDevice,
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
