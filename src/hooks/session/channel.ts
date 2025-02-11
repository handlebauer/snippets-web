import type { Enums } from '@/lib/supabase.types'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
type RecordingSessionType = Enums<'recording_session_type'>

interface ChannelState {
    isConnected: boolean
    error: string | null
    pairingCode: string | null
    sessionType: RecordingSessionType | null
}

type StateUpdater = (updater: (prev: ChannelState) => ChannelState) => void

// Track cleanup state for each channel
const cleanupStates = new WeakMap<RealtimeChannel, boolean>()

export const handleDisconnect = (setState: StateUpdater) => {
    setState((prev: ChannelState) => ({
        ...prev,
        isConnected: false,
        error: 'Channel disconnected',
        sessionType: null,
    }))
}

export const handleSessionType = (
    setState: StateUpdater,
    type: RecordingSessionType,
) => {
    setState((prev: ChannelState) => ({
        ...prev,
        sessionType: type,
    }))
}

export const setupChannel = async (
    supabase: SupabaseClient,
    pairingCode: string,
    setState: StateUpdater,
) => {
    console.log('🔄 Starting channel setup for code:', pairingCode)
    if (!pairingCode) {
        throw new Error('Please enter a complete pairing code')
    }

    const channel = supabase.channel(`session:${pairingCode}`, {
        config: {
            presence: {
                key: pairingCode,
            },
        },
    })
    console.log('📡 Channel created with ID:', `session:${pairingCode}`)

    // Initialize cleanup state
    cleanupStates.set(channel, false)

    // Set up event handlers
    channel.on('system', { event: '*' }, ({ eventType }) => {
        if (eventType === 'disconnect') {
            handleDisconnect(setState)
        }
    })

    // Listen for session type signal
    channel.on('broadcast', { event: 'session_type' }, ({ payload }) => {
        console.log('📢 [Channel] Received session type signal:', payload)
        handleSessionType(setState, payload.type as RecordingSessionType)
    })

    // Wait for channel subscription and presence sync
    await new Promise<void>((resolve, reject) => {
        let presenceSynced = false
        channel
            .on('presence', { event: 'sync' }, () => {
                console.log('👥 Presence synced')
                const state = channel.presenceState()
                console.log('👥 Current presence state:', state)
                presenceSynced = true
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('🟢 Presence join:', { key, newPresences })
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('🔴 Presence leave:', { key, leftPresences })
            })
            .subscribe(async (status: ChannelStatus) => {
                console.log('📡 Channel status:', status)
                const isCleaningUp = cleanupStates.get(channel) || false

                if (status === 'SUBSCRIBED') {
                    try {
                        console.log('✅ Channel subscribed, tracking presence')
                        await channel.track({
                            online_at: new Date().toISOString(),
                            client_type: 'web',
                            session_code: pairingCode,
                        })
                        console.log('👤 Presence tracked')
                        console.log(
                            '🔍 Current presence state:',
                            channel.presenceState(),
                        )

                        // Wait for presence sync before resolving
                        while (!presenceSynced) {
                            await new Promise(r => setTimeout(r, 100))
                        }
                        console.log('🤝 Channel setup complete')
                        resolve()
                    } catch (error) {
                        console.error('❌ Error tracking presence:', error)
                        reject(error)
                    }
                } else if (
                    status === 'CHANNEL_ERROR' ||
                    status === 'TIMED_OUT'
                ) {
                    const error = new Error(
                        `Channel subscription failed: ${status}`,
                    )
                    console.error('❌ Channel error:', error)
                    reject(error)
                } else if (status === 'CLOSED' && !isCleaningUp) {
                    console.log('⚠️ Channel closed unexpectedly')
                    resolve()
                }
            })
    })

    return channel
}

export const cleanupChannel = async (
    supabase: SupabaseClient,
    channel: RealtimeChannel | null,
) => {
    if (channel) {
        try {
            console.log('🧹 Starting channel cleanup')
            // Mark channel as cleaning up
            cleanupStates.set(channel, true)

            // First untrack presence
            await channel.untrack()
            console.log('👋 Presence untracked')

            // Then unsubscribe
            await channel.unsubscribe()
            console.log('🔌 Channel unsubscribed')

            // Finally remove the channel
            await supabase.removeChannel(channel)
            console.log('✅ Channel cleanup complete')
        } catch (error) {
            console.log('⚠️ Non-critical error during channel cleanup:', error)
        }
    }
}
