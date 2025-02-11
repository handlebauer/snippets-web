'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MEDIA_CONSTRAINTS } from '@/constants/webrtc'
import { useChannel } from '@/contexts/channel-context'

import { setupPeerConnection, stopMediaStream } from './webrtc/connection'
import { handleVideoProcessing, setupRecorder } from './webrtc/recording'

// Types
interface ScreenState {
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

// Constants
const INITIAL_SCREEN_STATE: ScreenState = {
    isSharing: false,
    isRecording: false,
}

const INITIAL_WEBRTC_CONTEXT: WebRTCContext = {
    peerConnection: null,
    stream: null,
    mediaRecorder: null,
    candidateQueue: [],
    isRecording: false,
}

// Channel event types
type RecordingSignal = {
    action: 'start' | 'stop'
}

export function useScreenSession() {
    const {
        state: channelState,
        getChannel,
        disconnect,
        handlePairDevice,
    } = useChannel()
    const channel = getChannel()

    const [state, setState] = useState<ScreenState>(INITIAL_SCREEN_STATE)
    const context = useRef<WebRTCContext>(INITIAL_WEBRTC_CONTEXT)

    // Media cleanup handler
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

        context.current = INITIAL_WEBRTC_CONTEXT
        setState(prev => ({
            ...prev,
            isSharing: false,
            isRecording: false,
        }))
    }, [state.isRecording])

    // Screen sharing handler
    const startSharing = useCallback(async () => {
        try {
            console.log('🎥 Starting screen share')
            const stream =
                await navigator.mediaDevices.getDisplayMedia(MEDIA_CONSTRAINTS)

            if (!channel) {
                throw new Error('No channel available for screen sharing')
            }

            // Set up peer connection
            const { peerConnection } = await setupPeerConnection(
                stream,
                channel,
                context.current.candidateQueue,
            )

            context.current = {
                ...context.current,
                peerConnection,
                stream,
            }

            // Handle stream stop
            stream.getVideoTracks()[0].onended = () => {
                console.log('📺 Screen share stopped by user')
                stopSharing()
            }

            setState(prev => ({ ...prev, isSharing: true }))
        } catch (error) {
            console.error('Failed to start screen share:', error)
            stopSharing()
        }
    }, [channel, stopSharing])

    // Recording signal handler
    const handleRecordingSignal = useCallback(
        async (signal: RecordingSignal) => {
            console.log('🎥 Received recording signal:', {
                action: signal.action,
                isSharing: state.isSharing,
                isRecording: state.isRecording,
            })

            if (signal.action === 'stop') {
                if (context.current.mediaRecorder) {
                    context.current.mediaRecorder.stop()
                }
                stopSharing()
                return
            }

            if (signal.action === 'start') {
                // Start sharing if not already sharing
                if (!context.current.stream) {
                    try {
                        await startSharing()
                    } catch (error) {
                        console.error('Failed to start sharing:', error)
                        return
                    }
                }

                const stream = context.current.stream
                if (!stream) {
                    console.error('No stream available for recording')
                    return
                }

                if (!context.current.isRecording) {
                    try {
                        console.log('🎥 Setting up recorder:', {
                            pairingCode: channelState.pairingCode,
                        })

                        const recorder = setupRecorder(
                            stream,
                            channelState.pairingCode || '',
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

                        context.current = {
                            ...context.current,
                            isRecording: true,
                            mediaRecorder: recorder,
                        }
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
        [
            channel,
            channelState.pairingCode,
            stopSharing,
            startSharing,
            state.isSharing,
            state.isRecording,
        ],
    )

    // Channel event handlers setup
    useEffect(() => {
        if (channel && channelState.sessionType === 'screen_recording') {
            console.log('📺 Setting up screen recording session:', {
                pairingCode: channelState.pairingCode,
            })

            // Subscribe to recording signals
            channel.on('broadcast', { event: 'recording' }, ({ payload }) => {
                handleRecordingSignal(payload as RecordingSignal)
            })
        }
    }, [
        channelState.sessionType,
        channelState.pairingCode,
        channel,
        handleRecordingSignal,
    ])

    // Cleanup handler
    const cleanup = useCallback(() => {
        stopSharing()
        disconnect()
        setState(INITIAL_SCREEN_STATE)
    }, [disconnect, stopSharing])

    return {
        state: {
            ...state,
            isConnected: channelState.isConnected,
            isPairing: false,
            error: channelState.error,
            pairingCode: channelState.pairingCode || '',
            sessionType: channelState.sessionType,
        },
        handlePairDevice,
        startSharing,
        stopSharing,
        cleanup,
    }
}
