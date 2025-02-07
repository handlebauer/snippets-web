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
    VideoProcessingSignal,
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
    const [videoChannel, setVideoChannel] = useState<RealtimeChannel | null>(
        null,
    )
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
        if (videoChannel) {
            supabase.removeChannel(videoChannel)
            setVideoChannel(null)
        }
        if (mediaRecorderRef.current && isRecordingRef.current) {
            mediaRecorderRef.current.stop()
            mediaRecorderRef.current = null
        }
        isRecordingRef.current = false
        setState(prev => ({ ...prev, isSharing: false, isRecording: false }))
    }, [peerConnection, channel, videoChannel, supabase])

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

                    recorder.onstop = async () => {
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

                        // Create FormData and append the video
                        const formData = new FormData()
                        const filename = `screen-recording-${new Date().toISOString()}.webm`
                        formData.append('video', blob, filename)
                        formData.append('sessionCode', state.accessCode)

                        // Set up video processing channel if not already set up
                        if (!videoChannel) {
                            console.log(
                                '📡 Setting up video processing channel:',
                                {
                                    channelName: `video:${state.accessCode}`,
                                    accessCode: state.accessCode,
                                },
                            )
                            const newVideoChannel = supabase.channel(
                                `video:${state.accessCode}`,
                                {
                                    config: CHANNEL_CONFIG,
                                },
                            )

                            // Wait for subscription to be ready
                            await new Promise<void>((resolve, reject) => {
                                const timeout = setTimeout(() => {
                                    reject(
                                        new Error(
                                            'Video channel subscription timeout',
                                        ),
                                    )
                                }, 5000)

                                newVideoChannel.subscribe(status => {
                                    console.log('📡 Video channel status:', {
                                        status,
                                        channelName: `video:${state.accessCode}`,
                                    })
                                    if (status === 'SUBSCRIBED') {
                                        clearTimeout(timeout)
                                        resolve()
                                    } else if (
                                        status === 'CLOSED' ||
                                        status === 'CHANNEL_ERROR'
                                    ) {
                                        clearTimeout(timeout)
                                        reject(
                                            new Error(
                                                `Video channel subscription failed: ${status}`,
                                            ),
                                        )
                                    }
                                })
                            })

                            // Store channel reference before proceeding
                            const localVideoChannel = newVideoChannel
                            setVideoChannel(localVideoChannel)

                            // Send initial processing status
                            const sendProcessingStatus = async (
                                signal: VideoProcessingSignal,
                            ) => {
                                console.log(
                                    '📤 Sending video processing status:',
                                    {
                                        signal,
                                        channelState: localVideoChannel.state,
                                        channelName: `video:${state.accessCode}`,
                                    },
                                )
                                try {
                                    await localVideoChannel.send({
                                        type: 'broadcast',
                                        event: 'video_processing',
                                        payload: signal,
                                    })
                                    console.log(
                                        '✅ Video processing status sent',
                                    )
                                } catch (error) {
                                    console.error(
                                        '❌ Failed to send video processing status:',
                                        {
                                            error,
                                            channelState:
                                                localVideoChannel.state,
                                        },
                                    )
                                }
                            }

                            try {
                                // Send initial processing status
                                await sendProcessingStatus({
                                    type: 'video_processing',
                                    status: 'processing',
                                })

                                console.log('📤 Uploading video to server...')
                                const response = await fetch(
                                    '/api/videos/upload',
                                    {
                                        method: 'POST',
                                        body: formData,
                                    },
                                )

                                if (!response.ok) {
                                    const errorData = await response.json()
                                    console.error('❌ Upload response error:', {
                                        status: response.status,
                                        statusText: response.statusText,
                                        error: errorData,
                                    })
                                    await sendProcessingStatus({
                                        type: 'video_processing',
                                        status: 'error',
                                        error:
                                            errorData.error ||
                                            response.statusText,
                                    })
                                    throw new Error(
                                        `Failed to upload video: ${errorData.error || response.statusText}`,
                                    )
                                }

                                const data = await response.json()
                                console.log(
                                    '✅ Video uploaded successfully:',
                                    data.video,
                                )

                                // Send completion status with video ID
                                await sendProcessingStatus({
                                    type: 'video_processing',
                                    status: 'completed',
                                    videoId: data.video.id,
                                })
                            } catch (error) {
                                console.error(
                                    '❌ Failed to upload video:',
                                    error,
                                )
                                // Send error status if not already sent
                                await sendProcessingStatus({
                                    type: 'video_processing',
                                    status: 'error',
                                    error:
                                        error instanceof Error
                                            ? error.message
                                            : 'Failed to process video',
                                })
                            } finally {
                                isRecordingRef.current = false
                                mediaRecorderRef.current = null
                                setState(prev => ({
                                    ...prev,
                                    isRecording: false,
                                }))
                            }
                        }
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

                // Stop all tracks in the stream to end browser's screen sharing
                stream.getTracks().forEach(track => {
                    console.log('🛑 Stopping track:', track.kind)
                    track.stop()
                })

                // Stop screen sharing after recording is stopped
                console.log('🛑 Stopping screen sharing due to recording stop')
                stopSharing()
            }
        },
        [
            state.isSharing,
            state.isPairing,
            peerConnection,
            channel,
            state.accessCode,
            videoChannel,
            supabase,
            stopSharing,
        ],
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
                let presenceSynced = false

                pairingChannel
                    .on('presence', { event: 'sync' }, () => {
                        console.log('📡 Presence synced')
                        presenceSynced = true
                    })
                    .subscribe(async status => {
                        console.log('📡 Channel status:', status)
                        if (status === 'SUBSCRIBED') {
                            try {
                                // Track our presence
                                await pairingChannel.track({
                                    online_at: new Date().toISOString(),
                                    client_type: 'web',
                                    session_code: state.accessCode,
                                })

                                // Wait for presence to sync
                                const syncTimeout = setTimeout(() => {
                                    if (!presenceSynced) {
                                        reject(
                                            new Error('Presence sync timeout'),
                                        )
                                    }
                                }, 5000)

                                // Wait for presence to sync
                                while (!presenceSynced) {
                                    await new Promise(r => setTimeout(r, 100))
                                }
                                clearTimeout(syncTimeout)

                                resolve()
                            } catch (error) {
                                reject(error)
                            }
                        } else if (
                            status === 'CLOSED' ||
                            status === 'CHANNEL_ERROR'
                        ) {
                            reject(
                                new Error(
                                    `Channel subscription failed: ${status}`,
                                ),
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
