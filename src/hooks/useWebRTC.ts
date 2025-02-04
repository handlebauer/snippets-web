import { useCallback, useState } from 'react'
import {
    CHANNEL_CONFIG,
    MEDIA_CONSTRAINTS,
    PRESENCE_SYNC_DELAY,
    WEBRTC_CONFIG,
} from '@/constants/webrtc'
import { createClient } from '@/utils/supabase.client'

import type { ScreenShareState, WebRTCSignal } from '@/types/webrtc'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useWebRTC() {
    const [state, setState] = useState<ScreenShareState>({
        isSharing: false,
        isPairing: false,
        error: null,
        accessCode: '',
    })
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [peerConnection, setPeerConnection] =
        useState<RTCPeerConnection | null>(null)
    const [channel, setChannel] = useState<RealtimeChannel | null>(null)
    const [supabase] = useState(() => createClient())

    const stopSharing = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
            setStream(null)
        }
        if (peerConnection) {
            peerConnection.close()
            setPeerConnection(null)
        }
        if (channel) {
            supabase.removeChannel(channel)
            setChannel(null)
        }
        setState(prev => ({ ...prev, isSharing: false }))
    }, [stream, peerConnection, channel, supabase])

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(WEBRTC_CONFIG)

        pc.onconnectionstatechange = () => {
            console.log('📡 WebRTC Connection State:', pc.connectionState)
            if (pc.connectionState === 'disconnected') {
                stopSharing()
            }
        }

        return pc
    }, [stopSharing])

    const handlePairDevice = useCallback(async () => {
        if (state.accessCode.length !== 6) {
            setState(prev => ({
                ...prev,
                error: 'Please enter a complete access code',
            }))
            return
        }

        setState(prev => ({ ...prev, isPairing: true, error: null }))
        console.log('🔄 Attempting to pair with code:', state.accessCode)

        let localPeerConnection: RTCPeerConnection | null = null
        let localStream: MediaStream | null = null

        try {
            // Create and subscribe to the channel
            const pairingChannel = supabase.channel(
                `webrtc:${state.accessCode}`,
                {
                    config: CHANNEL_CONFIG,
                },
            )

            // Wait for channel subscription and presence tracking
            await new Promise<void>((resolve, reject) => {
                pairingChannel.subscribe(async status => {
                    if (status === 'SUBSCRIBED') {
                        console.log('🌐 Web client subscribed to channel')
                        try {
                            await pairingChannel.track({
                                online_at: new Date().toISOString(),
                            })
                            console.log('✅ Web presence tracked successfully')
                            resolve()
                        } catch (error) {
                            console.error('❌ Error tracking presence:', error)
                            reject(error)
                        }
                    } else if (
                        status === 'CLOSED' ||
                        status === 'CHANNEL_ERROR'
                    ) {
                        reject(
                            new Error(`Channel subscription failed: ${status}`),
                        )
                    }
                })
            })

            // Wait for presence sync
            await new Promise(resolve =>
                setTimeout(resolve, PRESENCE_SYNC_DELAY),
            )

            // Check for mobile client
            const presenceState = pairingChannel.presenceState()
            console.log(
                '🔍 Checking for mobile client in presence state:',
                JSON.stringify(presenceState, null, 2),
            )

            const hasMobileClient =
                Object.keys(presenceState).includes('mobile') &&
                presenceState.mobile.length > 0

            if (!hasMobileClient) {
                console.log(
                    '❌ No mobile device found with code:',
                    state.accessCode,
                )
                setState(prev => ({
                    ...prev,
                    error: 'No mobile device waiting with this code. Please check the code and try again.',
                }))
                supabase.removeChannel(pairingChannel)
                return
            }

            console.log('✅ Mobile device found, initiating screen share')

            // Request screen sharing
            console.log('🎥 Requesting screen share access...')
            localStream =
                await navigator.mediaDevices.getDisplayMedia(MEDIA_CONSTRAINTS)

            // Initialize peer connection
            localPeerConnection = initializePeerConnection()

            // Set up WebRTC signal handling
            pairingChannel.on(
                'broadcast',
                { event: 'webrtc' },
                async ({ payload }) => {
                    const signal = payload as WebRTCSignal
                    if (!localPeerConnection) return

                    try {
                        if (signal.type === 'answer' && signal.payload.answer) {
                            if (localPeerConnection.currentRemoteDescription)
                                return
                            console.log('📱 Received answer from mobile device')
                            const answer = new RTCSessionDescription(
                                signal.payload.answer,
                            )
                            await localPeerConnection.setRemoteDescription(
                                answer,
                            )
                        } else if (
                            signal.type === 'ice-candidate' &&
                            signal.payload.candidate
                        ) {
                            console.log('🧊 Received ICE candidate')
                            await localPeerConnection.addIceCandidate(
                                new RTCIceCandidate(signal.payload.candidate),
                            )
                        }
                    } catch (err) {
                        console.error('Error handling signal:', err)
                    }
                },
            )

            // Set up ICE candidate handling
            localPeerConnection.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    console.log('🧊 Sending ICE candidate')
                    pairingChannel.send({
                        type: 'broadcast',
                        event: 'webrtc',
                        payload: {
                            type: 'ice-candidate',
                            payload: { candidate },
                        },
                    })
                }
            }

            // Add tracks to peer connection
            localStream.getTracks().forEach(track => {
                if (localPeerConnection) {
                    localPeerConnection.addTrack(track, localStream!)
                }
            })

            // Create and set local description
            const offer = await localPeerConnection.createOffer()
            await localPeerConnection.setLocalDescription(offer)

            console.log('📤 Sending WebRTC offer to mobile device')
            await pairingChannel.send({
                type: 'broadcast',
                event: 'webrtc',
                payload: {
                    type: 'offer',
                    payload: { offer },
                },
            })

            // Update state after everything is set up
            setPeerConnection(localPeerConnection)
            setStream(localStream)
            setChannel(pairingChannel)
            setState(prev => ({ ...prev, isSharing: true }))

            // Listen for when the user stops sharing
            localStream.getVideoTracks()[0].onended = () => {
                console.log('🛑 Screen sharing stopped by user')
                stopSharing()
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: 'Failed to pair device. Please try again.',
            }))
            console.error('Pairing error:', error)
            // Clean up resources
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop())
            }
            if (localPeerConnection) {
                localPeerConnection.close()
            }
            if (channel) {
                supabase.removeChannel(channel)
                setChannel(null)
            }
        } finally {
            setState(prev => ({ ...prev, isPairing: false }))
        }
    }, [
        state.accessCode,
        supabase,
        initializePeerConnection,
        channel,
        stopSharing,
    ])

    return {
        state,
        setState,
        handlePairDevice,
        stopSharing,
        isSharing: state.isSharing,
        isPairing: state.isPairing,
        error: state.error,
        accessCode: state.accessCode,
    }
}
