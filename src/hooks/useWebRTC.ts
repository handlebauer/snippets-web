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
                        state.pairingCode,
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

    const handlePairDevice = useCallback(async () => {
        if (state.pairingCode.length !== 6) {
            setState(prev => ({
                ...prev,
                error: 'Please enter a complete pairing code',
            }))
            return
        }

        setState(prev => ({ ...prev, isPairing: true, error: null }))

        try {
            const channel = await setupChannel(supabase, state.pairingCode)

            // Get screen sharing stream
            const stream =
                await navigator.mediaDevices.getDisplayMedia(MEDIA_CONSTRAINTS)

            // Set up WebRTC connection
            const { peerConnection, configuredChannel } =
                await setupPeerConnection(
                    stream,
                    channel,
                    context.current.candidateQueue,
                )

            // Update context
            context.current = {
                ...context.current,
                peerConnection,
                stream,
                channel: configuredChannel,
            }

            // Set up recording signal handler
            configuredChannel.on(
                'broadcast',
                { event: 'recording' },
                ({ payload }) => {
                    handleRecordingSignal(payload as RecordingSignal)
                },
            )

            setState(prev => ({ ...prev, isSharing: true }))

            // Handle user stopping screen share
            stream.getVideoTracks()[0].onended = stopSharing
        } catch (error) {
            console.error('Pairing error:', error)
            setState(prev => ({
                ...prev,
                error: 'Failed to pair device. Please try again.',
            }))
            stopSharing()
        } finally {
            setState(prev => ({ ...prev, isPairing: false }))
        }
    }, [state.pairingCode, supabase, handleRecordingSignal, stopSharing])

    return {
        state,
        setState,
        handlePairDevice,
        stopSharing,
    }
}
