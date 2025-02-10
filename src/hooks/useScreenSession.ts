'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MEDIA_CONSTRAINTS } from '@/constants/webrtc'

import { usePairing } from './usePairing'
import { setupPeerConnection, stopMediaStream } from './webrtc/connection'
import { handleVideoProcessing, setupRecorder } from './webrtc/recording'

interface ScreenState {
    isConnected: boolean
    isPairing: boolean
    error: string | null
    pairingCode: string
    isSharing: boolean
    isRecording: boolean
}

interface WebRTCContext {
    peerConnection: RTCPeerConnection | null
    stream: MediaStream | null
    mediaRecorder: MediaRecorder | null
    candidateQueue: RTCIceCandidate[]
    isRecording: boolean
}

export function useScreenSession() {
    const {
        state: pairingState,
        channel,
        handlePairDevice,
        cleanup: cleanupPairing,
    } = usePairing()
    const [state, setState] = useState<ScreenState>({
        isConnected: false,
        isPairing: false,
        error: null,
        pairingCode: '',
        isSharing: false,
        isRecording: false,
    })

    // Context refs to hold WebRTC-related objects
    const context = useRef<WebRTCContext>({
        peerConnection: null,
        stream: null,
        mediaRecorder: null,
        candidateQueue: [],
        isRecording: false,
    })

    const stopSharing = useCallback(() => {
        if (context.current.stream) {
            stopMediaStream(context.current.stream)
        }
        if (context.current.peerConnection) {
            context.current.peerConnection.close()
        }
        if (context.current.mediaRecorder && state.isRecording) {
            context.current.mediaRecorder.stop()
        }

        context.current = {
            peerConnection: null,
            stream: null,
            mediaRecorder: null,
            candidateQueue: [],
            isRecording: false,
        }

        setState(prev => ({
            ...prev,
            isSharing: false,
            isRecording: false,
        }))
    }, [state.isRecording])

    const startSharing = useCallback(async () => {
        if (!channel) {
            setState(prev => ({
                ...prev,
                error: 'No channel available for screen sharing',
            }))
            return
        }

        try {
            // Get screen sharing stream
            const stream =
                await navigator.mediaDevices.getDisplayMedia(MEDIA_CONSTRAINTS)

            // Set up WebRTC connection
            const { peerConnection } = await setupPeerConnection(
                stream,
                channel,
                context.current.candidateQueue,
            )

            // Update context
            context.current = {
                ...context.current,
                peerConnection,
                stream,
            }

            setState(prev => ({ ...prev, isSharing: true }))

            // Handle user stopping screen share
            stream.getVideoTracks()[0].onended = () => {
                stopSharing()
            }
        } catch (error) {
            console.error('Screen sharing error:', error)
            setState(prev => ({
                ...prev,
                error: 'Failed to start screen sharing. Please try again.',
            }))
            stopSharing()
        }
    }, [channel, stopSharing])

    const handleRecordingSignal = useCallback(
        async (signal: { action: 'start' | 'stop' }) => {
            console.log('🎥 Received recording signal:', {
                action: signal.action,
                hasStream: !!context.current.stream,
                hasChannel: !!channel,
                isRecording: context.current.isRecording,
            })

            // For stop signals, we want to handle them regardless of stream state
            if (signal.action === 'stop') {
                if (
                    context.current.isRecording &&
                    context.current.mediaRecorder
                ) {
                    context.current.mediaRecorder.stop()
                }
                stopSharing()
                return
            }

            // For start signals, we need to ensure we have a stream
            if (signal.action === 'start') {
                // If we don't have a stream yet, try to start sharing
                if (!context.current.stream) {
                    console.log('🔄 No stream available, starting screen share')
                    try {
                        await startSharing()
                        // Wait a bit for the stream to be ready
                        await new Promise(resolve => setTimeout(resolve, 500))
                    } catch (error) {
                        console.error('Failed to start screen share:', error)
                        return
                    }
                }

                const { stream } = context.current
                if (!stream || !channel) {
                    console.error(
                        'Cannot record: No stream or channel available after setup',
                    )
                    return
                }

                if (!context.current.isRecording) {
                    try {
                        console.log(
                            '🎥 Setting up recorder with pairing code:',
                            pairingState.pairingCode,
                        )
                        const recorder = setupRecorder(
                            stream,
                            pairingState.pairingCode,
                            async (formData: FormData) => {
                                if (channel) {
                                    await handleVideoProcessing(
                                        formData,
                                        channel,
                                    )
                                }
                            },
                            () => {
                                context.current.isRecording = false
                                context.current.mediaRecorder = null
                                setState(prev => ({
                                    ...prev,
                                    isRecording: false,
                                }))
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
                }
            }
        },
        [channel, pairingState.pairingCode, stopSharing, startSharing],
    )

    // Listen for session type and handle screen-specific setup
    useEffect(() => {
        if (pairingState.sessionType === 'screen_recording' && channel) {
            setState(prev => ({
                ...prev,
                isConnected: true,
                pairingCode: pairingState.pairingCode,
            }))

            // Set up recording signal handler
            channel.on('broadcast', { event: 'recording' }, ({ payload }) => {
                handleRecordingSignal(payload)
            })
        }
    }, [
        pairingState.sessionType,
        pairingState.pairingCode,
        channel,
        handleRecordingSignal,
    ])

    const cleanup = useCallback(() => {
        stopSharing()
        cleanupPairing()
        setState({
            isConnected: false,
            isPairing: false,
            error: null,
            pairingCode: '',
            isSharing: false,
            isRecording: false,
        })
    }, [cleanupPairing, stopSharing])

    return {
        state,
        handlePairDevice,
        startSharing,
        stopSharing,
        cleanup,
        pairingState,
    }
}
