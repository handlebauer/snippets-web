import { CHANNEL_CONFIG } from '@/constants/webrtc'

import type { VideoProcessingSignal } from '@/types/webrtc'
import type { SupabaseClient } from '@supabase/supabase-js'

type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

// Track cleanup state for each channel
const cleanupStates = new WeakMap<
    ReturnType<SupabaseClient['channel']>,
    boolean
>()

export const setupChannel = async (
    supabase: SupabaseClient,
    pairingCode: string,
    onVideoProcessing?: (signal: VideoProcessingSignal) => void,
) => {
    console.log('🔄 Starting channel setup for code:', pairingCode)
    if (!pairingCode) {
        throw new Error('Please enter a complete pairing code')
    }

    const channel = supabase.channel(`webrtc:${pairingCode}`, {
        config: CHANNEL_CONFIG,
    })
    console.log('📡 Channel created with ID:', `webrtc:${pairingCode}`)

    // Initialize cleanup state
    cleanupStates.set(channel, false)

    if (onVideoProcessing) {
        console.log('🎥 Setting up video processing handler')
        channel.on(
            'broadcast',
            { event: 'video_processing' },
            ({ payload }) => {
                console.log('📼 Received video processing signal:', payload)
                if (!payload || typeof payload !== 'object') {
                    console.error(
                        'Invalid video processing signal payload:',
                        payload,
                    )
                    return
                }
                onVideoProcessing(payload as VideoProcessingSignal)
            },
        )
    }

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
                    // Only reject for actual errors, not normal cleanup
                    const error = new Error(
                        `Channel subscription failed: ${status}`,
                    )
                    console.error('❌ Channel error:', error)
                    reject(error)
                } else if (status === 'CLOSED' && !isCleaningUp) {
                    // Only log for unexpected closures
                    console.log('⚠️ Channel closed unexpectedly')
                    resolve()
                }
            })
    })

    return channel
}

export const cleanupChannel = async (
    supabase: SupabaseClient,
    channel: ReturnType<SupabaseClient['channel']> | null,
) => {
    if (channel) {
        try {
            console.log('🧹 Starting channel cleanup')
            // Mark channel as cleaning up
            cleanupStates.set(channel, true)

            // First unsubscribe - don't await this as it might be already closed
            channel.unsubscribe().catch(err => {
                console.log('ℹ️ Channel already unsubscribed:', err.message)
            })

            // Then remove the channel - this should always work
            await supabase.removeChannel(channel)
            console.log('✅ Channel cleanup complete')
        } catch (error) {
            // Just log the error, don't throw - cleanup should be best-effort
            console.log('⚠️ Non-critical error during channel cleanup:', error)
        }
    }
}
