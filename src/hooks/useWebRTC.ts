import { useCallback, useRef, useState } from 'react'
import { MEDIA_CONSTRAINTS } from '@/constants/webrtc'
import { createClient } from '@/utils/supabase.client'

import { cleanupChannel, setupChannel } from './webrtc/channel'
import { setupPeerConnection, stopMediaStream } from './webrtc/connection'
import { handleVideoProcessing, setupRecorder } from './webrtc/recording'

import type { RecordingSignal, ScreenShareState } from '@/types/webrtc'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Types for internal use
interface WebRTCContext {
    peerConnection: RTCPeerConnection | null
    stream: MediaStream | null
    channel: RealtimeChannel | null
    mediaRecorder: MediaRecorder | null
    isRecording: boolean
    candidateQueue: RTCIceCandidate[]
    pairingCode: string | null
}

export function useWebRTC() {
    const [state, setState] = useState<ScreenShareState>({
        isSharing: false,
        isPairing: false,
        error: null,
        pairingCode: '',
        isRecording: false,
    })

    // Context refs to hold WebRTC-related objects
    const context = useRef<WebRTCContext>({
        peerConnection: null,
        stream: null,
        channel: null,
        mediaRecorder: null,
        isRecording: false,
        candidateQueue: [],
        pairingCode: null,
    })

    const [supabase] = useState(() => createClient())

    const stopSharing = useCallback(() => {
        if (context.current.stream) {
            stopMediaStream(context.current.stream)
        }
        if (context.current.peerConnection) {
            context.current.peerConnection.close()
        }
        cleanupChannel(supabase, context.current.channel)
        if (context.current.mediaRecorder && context.current.isRecording) {
            context.current.mediaRecorder.stop()
        }

        context.current = {
            peerConnection: null,
            stream: null,
            channel: null,
            mediaRecorder: null,
            isRecording: false,
            candidateQueue: [],
            pairingCode: null,
        }
        setState(prev => ({ ...prev, isSharing: false, isRecording: false }))
    }, [supabase])

    const handleRecordingSignal = useCallback(
        async (signal: RecordingSignal) => {
            const { stream, mediaRecorder, channel } = context.current

            if (!stream || !channel) {
                console.error('Cannot record: No stream or channel available')
                return
            }

            if (signal.action === 'start' && !context.current.isRecording) {
                try {
                    const recorder = setupRecorder(
                        stream,
                        context.current.pairingCode || state.pairingCode,
                        async (formData: FormData) => {
                            await handleVideoProcessing(formData, channel)
                        },
                        () => {
                            context.current.isRecording = false
                            context.current.mediaRecorder = null
                            setState(prev => ({ ...prev, isRecording: false }))
                        },
                    )

                    context.current.isRecording = true
                    context.current.mediaRecorder = recorder
                    setState(prev => ({ ...prev, isRecording: true }))
                    recorder.start(1000)
                } catch (error) {
                    console.error('Failed to start recording:', error)
                    context.current.isRecording = false
                    setState(prev => ({ ...prev, isRecording: false }))
                }
            } else if (signal.action === 'stop') {
                if (context.current.isRecording && mediaRecorder) {
                    mediaRecorder.requestData()
                    mediaRecorder.stop()
                }
                stopMediaStream(stream)
                stopSharing()
            }
        },
        [state.pairingCode, stopSharing],
    )

    const handlePairDevice = useCallback(
        async (code?: string) => {
            const pairingCode = code || state.pairingCode
            console.log('🔑 handlePairDevice called with code:', pairingCode)
            console.log('📏 Code length:', pairingCode.length)

            if (pairingCode.length !== 6) {
                console.log(
                    '❌ Invalid code length, expected 6 but got:',
                    pairingCode.length,
                )
                setState(prev => ({
                    ...prev,
                    error: 'Please enter a complete pairing code',
                }))
                return
            }

            setState(prev => ({ ...prev, isPairing: true, error: null }))

            try {
                console.log(
                    '📡 Setting up Supabase channel with code:',
                    pairingCode,
                )
                // Only set up the channel for initial pairing
                const channel = await setupChannel(supabase, pairingCode)
                console.log('✅ Channel setup complete')

                // Set up recording signal handler
                console.log('🎥 Setting up recording signal handler')
                channel.on(
                    'broadcast',
                    { event: 'recording' },
                    ({ payload }) => {
                        console.log('📼 Received recording signal:', payload)
                        handleRecordingSignal(payload as RecordingSignal)
                    },
                )

                // Store channel in context
                context.current.channel = channel
                context.current.pairingCode = pairingCode
                console.log('💾 Channel and pairing code stored in context')

                // Update state with the code we used
                setState(prev => ({
                    ...prev,
                    isPairing: false,
                    pairingCode,
                }))
            } catch (error) {
                console.error('❌ Pairing error:', error)
                setState(prev => ({
                    ...prev,
                    error: 'Failed to pair device. Please try again.',
                }))
                stopSharing()
            } finally {
                setState(prev => ({ ...prev, isPairing: false }))
            }
        },
        [state.pairingCode, supabase, handleRecordingSignal, stopSharing],
    )

    const startScreenSharing = useCallback(async () => {
        setState(prev => ({ ...prev, isPairing: true, error: null }))
        console.log('🎬 Starting screen sharing setup')

        try {
            const { channel } = context.current
            if (!channel) {
                console.error('❌ No channel available for screen sharing')
                throw new Error('No channel available')
            }
            console.log('📡 Using existing channel for WebRTC')

            // Get screen sharing stream
            console.log('🖥️ Requesting screen share permission')
            const stream =
                await navigator.mediaDevices.getDisplayMedia(MEDIA_CONSTRAINTS)
            console.log('✅ Screen share permission granted')

            // Set up WebRTC connection
            console.log('🤝 Setting up WebRTC peer connection')
            const { peerConnection, configuredChannel } =
                await setupPeerConnection(
                    stream,
                    channel,
                    context.current.candidateQueue,
                )
            console.log('✅ WebRTC peer connection established')

            // Update context
            context.current = {
                ...context.current,
                peerConnection,
                stream,
                channel: configuredChannel,
            }
            console.log('💾 Updated context with WebRTC connection')

            setState(prev => ({ ...prev, isSharing: true }))

            // Handle user stopping screen share
            stream.getVideoTracks()[0].onended = () => {
                console.log('🛑 User stopped screen sharing')
                stopSharing()
            }
        } catch (error) {
            console.error('❌ Screen sharing error:', error)
            setState(prev => ({
                ...prev,
                error: 'Failed to start screen sharing. Please try again.',
            }))
            stopSharing()
        } finally {
            setState(prev => ({ ...prev, isPairing: false }))
        }
    }, [stopSharing])

    return {
        state,
        setState,
        handlePairDevice,
        startScreenSharing,
        stopSharing,
    }
}
