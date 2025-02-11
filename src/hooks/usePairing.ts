'use client'

import { useCallback } from 'react'

import { useChannel } from '../contexts/channel-context'

export function usePairing() {
    const { state, connect, disconnect, getChannel } = useChannel()

    const handlePairDevice = useCallback(
        async (code: string) => {
            if (code.length !== 6) {
                throw new Error('Please enter a complete pairing code')
            }

            try {
                await connect(code)
                const channel = getChannel()

                if (!channel) {
                    throw new Error('Channel not established')
                }

                console.log(
                    '✅ Channel setup complete, waiting for session type',
                )
            } catch (error) {
                console.error('❌ Pairing error:', error)
                throw error
            }
        },
        [connect, getChannel],
    )

    return {
        state,
        channel: getChannel(),
        handlePairDevice,
        cleanup: disconnect,
    }
}
