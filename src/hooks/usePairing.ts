'use client'

import { useCallback, useState } from 'react'

import { useChannel } from './session/ChannelContext'

import type { Database } from '@/lib/supabase.types'

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

    const { connect, disconnect, getChannel } = useChannel()

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
                await connect(code)
                const channel = getChannel()

                if (!channel) {
                    throw new Error('Channel not established')
                }

                // Set up session type listener
                channel.on(
                    'broadcast',
                    { event: 'session_type' },
                    ({ payload }) => {
                        console.log('📢 Received session type signal:', {
                            type: payload.type,
                            channel: channel.topic,
                            state: channel.state,
                        })
                        setState(prev => ({
                            ...prev,
                            sessionType: payload.type as RecordingSessionType,
                            isConnected: true,
                        }))
                    },
                )

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
        [connect, getChannel],
    )

    const cleanup = useCallback(() => {
        disconnect()
        setState({
            isPairing: false,
            error: null,
            pairingCode: '',
            sessionType: null,
            isConnected: false,
        })
    }, [disconnect])

    return {
        state,
        channel: getChannel(),
        handlePairDevice,
        cleanup,
    }
}
