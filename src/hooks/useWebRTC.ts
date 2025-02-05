import { useCallback, useRef, useState } from 'react'
import {
    CHANNEL_CONFIG,
    MEDIA_CONSTRAINTS,
    WEBRTC_CONFIG,
} from '@/constants/webrtc'
import { createClient } from '@/utils/supabase.client'

import type {
    RecordingSignal,
    ScreenShareState,
    WebRTCSignal,
} from '@/types/webrtc'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useWebRTC() {
    const [state, setState] = useState<ScreenShareState>({
        isSharing: false,
        isPairing: false,
        error: null,
        accessCode: '',
        isRecording: false,
    })
    const streamRef = useRef<MediaStream | null>(null)
    const isRecordingRef = useRef(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const [peerConnection, setPeerConnection] =
        useState<RTCPeerConnection | null>(null)
    const [channel, setChannel] = useState<RealtimeChannel | null>(null)
    const [supabase] = useState(() => createClient())

    const stopSharing = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
        if (peerConnection) {
            peerConnection.close()
            setPeerConnection(null)
        }
        if (channel) {
            supabase.removeChannel(channel)
            setChannel(null)
        }
        if (mediaRecorderRef.current && isRecordingRef.current) {
            mediaRecorderRef.current.stop()
            mediaRecorderRef.current = null
        }
        isRecordingRef.current = false
        setState(prev => ({ ...prev, isSharing: false, isRecording: false }))
    }, [peerConnection, channel, supabase])

    const handleRecordingSignal = useCallback(
        (signal: RecordingSignal) => {
            const stream = streamRef.current
            const mediaRecorder = mediaRecorderRef.current

            console.log('📥 Received recording signal:', {
                action: signal.action,
                hasStream: !!stream,
                streamTracks: stream?.getTracks().length ?? 0,
                streamTrackStates:
                    stream?.getTracks().map(t => ({
                        kind: t.kind,
                        enabled: t.enabled,
                        muted: t.muted,
                        readyState: t.readyState,
                    })) ?? [],
                isCurrentlyRecording: isRecordingRef.current,
                hasMediaRecorder: !!mediaRecorder,
                mediaRecorderState: mediaRecorder?.state,
            })

            if (!stream) {
                console.error('❌ Cannot record: No stream available', {
                    isSharing: state.isSharing,
                    isPairing: state.isPairing,
                    peerConnectionState: peerConnection?.connectionState,
                    channelState: channel?.state,
                })
                return
            }

            if (signal.action === 'start' && !isRecordingRef.current) {
                console.log('🎥 Starting recording...', {
                    streamActive: stream.active,
                    streamId: stream.id,
                    tracks: stream.getTracks().map(t => ({
                        kind: t.kind,
                        enabled: t.enabled,
                        muted: t.muted,
                        readyState: t.readyState,
                    })),
                })
                try {
                    const recorder = new MediaRecorder(stream, {
                        mimeType: 'video/webm;codecs=vp9',
                    })

                    const chunks: Blob[] = []
                    recorder.ondataavailable = e => {
                        console.log('💾 Received data chunk:', {
                            size: e.data.size,
                            type: e.data.type,
                            recorderState: recorder.state,
                        })
                        if (e.data.size > 0) {
                            chunks.push(e.data)
                        }
                    }

                    recorder.onstop = () => {
                        console.log(
                            '⏹️ Recording stopped, processing data...',
                            {
                                chunks: chunks.length,
                                totalSize: chunks.reduce(
                                    (acc, chunk) => acc + chunk.size,
                                    0,
                                ),
                            },
                        )
                        const blob = new Blob(chunks, { type: 'video/webm' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        const filename = `screen-recording-${new Date().toISOString()}.webm`
                        a.download = filename
                        console.log('💾 Saving recording:', {
                            filename,
                            size: blob.size,
                        })
                        a.click()
                        URL.revokeObjectURL(url)
                        isRecordingRef.current = false
                        mediaRecorderRef.current = null
                        setState(prev => ({ ...prev, isRecording: false }))
                    }

                    recorder.onerror = event => {
                        console.error('❌ MediaRecorder error:', event)
                        isRecordingRef.current = false
                        mediaRecorderRef.current = null
                        setState(prev => ({ ...prev, isRecording: false }))
                    }

                    // Start recording with a timeslice to get regular data chunks
                    isRecordingRef.current = true
                    setState(prev => ({ ...prev, isRecording: true }))
                    mediaRecorderRef.current = recorder
                    recorder.start(1000) // Get a chunk every second
                    console.log('✅ Recording started successfully')
                } catch (error) {
                    console.error('❌ Failed to start recording:', error)
                    isRecordingRef.current = false
                    setState(prev => ({ ...prev, isRecording: false }))
                }
            } else if (signal.action === 'stop') {
                // Debug log to see why we're not hitting the stop condition
                console.log('🔍 Stop signal received but conditions not met:', {
                    signalAction: signal.action,
                    isRecording: isRecordingRef.current,
                    hasMediaRecorder: !!mediaRecorder,
                    mediaRecorderState: mediaRecorder?.state,
                })

                if (isRecordingRef.current && mediaRecorder) {
                    console.log('⏹️ Stopping recording...', {
                        mediaRecorderState: mediaRecorder.state,
                        streamActive: stream.active,
                    })

                    mediaRecorder.requestData()
                    mediaRecorder.stop()
                }
            }
        },
        [state.isSharing, state.isPairing, peerConnection, channel],
    )

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
                { config: CHANNEL_CONFIG },
            )

            await new Promise<void>((resolve, reject) => {
                pairingChannel.subscribe(async status => {
                    if (status === 'SUBSCRIBED') {
                        try {
                            await pairingChannel.track({
                                online_at: new Date().toISOString(),
                            })
                            resolve()
                        } catch (error) {
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

            // Request screen sharing
            localStream =
                await navigator.mediaDevices.getDisplayMedia(MEDIA_CONSTRAINTS)
            console.log('🎥 Got screen sharing stream:', {
                tracks: localStream.getTracks().map(t => ({
                    kind: t.kind,
                    enabled: t.enabled,
                    muted: t.muted,
                })),
            })

            // Initialize peer connection
            const config = {
                ...WEBRTC_CONFIG,
                iceServers: [...WEBRTC_CONFIG.iceServers],
            }
            localPeerConnection = new RTCPeerConnection(config)

            // Set up WebRTC signal handling
            pairingChannel.on(
                'broadcast',
                { event: 'webrtc' },
                async ({ payload }) => {
                    const signal = payload as WebRTCSignal
                    if (!localPeerConnection) return

                    try {
                        if (signal.type === 'answer' && signal.payload.answer) {
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
                    const jsonCandidate = candidate.toJSON()
                    console.log('🧊 Sending ICE candidate', jsonCandidate)
                    pairingChannel.send({
                        type: 'broadcast',
                        event: 'webrtc',
                        payload: {
                            type: 'ice-candidate',
                            payload: { candidate: jsonCandidate },
                        },
                    })
                }
            }

            // Add tracks to peer connection
            localStream.getTracks().forEach(track => {
                if (localPeerConnection) {
                    console.log('➕ Adding track to peer connection:', {
                        kind: track.kind,
                        enabled: track.enabled,
                        muted: track.muted,
                    })
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
            streamRef.current = localStream
            setChannel(pairingChannel)

            // NOW set up recording signal handler after we have the stream
            pairingChannel.on(
                'broadcast',
                { event: 'recording' },
                ({ payload }) => {
                    console.log('📡 Channel received recording event:', {
                        channelState: pairingChannel.state,
                        presenceState: pairingChannel.presenceState(),
                        hasStream: !!localStream,
                        streamActive: localStream?.active,
                    })
                    handleRecordingSignal(payload as RecordingSignal)
                },
            )

            console.log('✅ WebRTC setup complete:', {
                hasStream: !!localStream,
                streamTracks: localStream.getTracks().length,
                hasPeerConnection: !!localPeerConnection,
                hasChannel: !!pairingChannel,
            })
            setState(prev => ({ ...prev, isSharing: true }))

            // Listen for when the user stops sharing
            localStream.getVideoTracks()[0].onended = () => {
                console.log('🛑 Screen sharing stopped by user')
                stopSharing()
            }
        } catch (error) {
            console.error('Pairing error:', error)
            setState(prev => ({
                ...prev,
                error: 'Failed to pair device. Please try again.',
            }))
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
        channel,
        stopSharing,
        handleRecordingSignal,
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
        isRecording: state.isRecording,
    }
}
