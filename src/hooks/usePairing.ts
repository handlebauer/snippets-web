'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/utils/supabase.client'

import { cleanupChannel, setupChannel } from './session/channel'

import type { Database } from '@/lib/supabase.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type RecordingSessionType =
    Database['public']['Enums']['recording_session_type']

interface PairingState {
    isPairing: boolean
    error: string | null
    pairingCode: string
    sessionType: RecordingSessionType | null
    isConnected: boolean
}

export function usePairing() {
    const [state, setState] = useState<PairingState>({
        isPairing: false,
        error: null,
        pairingCode: '',
        sessionType: null,
        isConnected: false,
    })

    const [supabase] = useState(() => createClient())
    const [channel, setChannel] = useState<RealtimeChannel | null>(null)

    const handlePairDevice = useCallback(
        async (code: string) => {
            if (code.length !== 6) {
                setState(prev => ({
                    ...prev,
                    error: 'Please enter a complete pairing code',
                }))
                return
            }

            setState(prev => ({ ...prev, isPairing: true, error: null }))

            try {
                const newChannel = await setupChannel(supabase, code)

                // Set up session type listener before subscribing
                newChannel.on(
                    'broadcast',
                    { event: 'session_type' },
                    ({ payload }) => {
                        console.log('📢 Received session type signal:', {
                            type: payload.type,
                            channel: newChannel.topic,
                            state: newChannel.state,
                        })
                        setState(prev => ({
                            ...prev,
                            sessionType: payload.type as RecordingSessionType,
                            isConnected: true,
                        }))
                    },
                )

                setChannel(newChannel)
                setState(prev => ({
                    ...prev,
                    pairingCode: code,
                    isPairing: false,
                }))
                console.log(
                    '✅ Channel setup complete, waiting for session type',
                )
            } catch (error) {
                console.error('❌ Pairing error:', error)
                setState(prev => ({
                    ...prev,
                    error: 'Failed to pair device. Please try again.',
                    isPairing: false,
                }))
            }
        },
        [supabase],
    )

    const cleanup = useCallback(() => {
        if (channel) {
            cleanupChannel(supabase, channel)
        }
        setState({
            isPairing: false,
            error: null,
            pairingCode: '',
            sessionType: null,
            isConnected: false,
        })
    }, [channel, supabase])

    return {
        state,
        channel,
        handlePairDevice,
        cleanup,
    }
}
