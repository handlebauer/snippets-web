import { WEBRTC_CONFIG } from '@/constants/webrtc'

import type { WebRTCSignal } from '@/types/webrtc'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const createPeerConnection = () => {
    const config = {
        ...WEBRTC_CONFIG,
        iceServers: [...WEBRTC_CONFIG.iceServers],
    }
    try {
        return new RTCPeerConnection(config)
    } catch (error) {
        console.error('Failed to create RTCPeerConnection:', error)
        throw new Error('Failed to initialize WebRTC connection')
    }
}

export const stopMediaStream = (stream: MediaStream | null) => {
    if (stream) {
        try {
            stream.getTracks().forEach(track => track.stop())
        } catch (error) {
            console.error('Error stopping media stream:', error)
        }
    }
}

export const setupWebRTCHandlers = (
    peerConnection: RTCPeerConnection,
    pairingChannel: RealtimeChannel,
    candidateQueue: RTCIceCandidate[],
) => {
    pairingChannel.on('broadcast', { event: 'webrtc' }, async ({ payload }) => {
        if (!payload || typeof payload !== 'object') {
            console.error('Invalid WebRTC signal payload:', payload)
            return
        }
        const signal = payload as WebRTCSignal
        if (!peerConnection) {
            console.error('No peer connection available')
            return
        }

        try {
            if (signal.type === 'answer' && signal.payload.answer) {
                if (!signal.payload.answer.sdp) {
                    console.error('Invalid answer SDP:', signal.payload.answer)
                    return
                }
                const answer = new RTCSessionDescription(signal.payload.answer)
                await peerConnection.setRemoteDescription(answer)

                // Now flush any ICE candidates that arrived before remoteDescription was set
                for (const queuedCandidate of candidateQueue) {
                    try {
                        await peerConnection.addIceCandidate(queuedCandidate)
                    } catch (err) {
                        console.error('Error flushing ICE candidate:', err)
                    }
                }
                candidateQueue.length = 0 // Clear the queue
            } else if (
                signal.type === 'ice-candidate' &&
                signal.payload.candidate
            ) {
                if (!signal.payload.candidate.candidate) {
                    console.error(
                        'Invalid ICE candidate:',
                        signal.payload.candidate,
                    )
                    return
                }
                const candidate = new RTCIceCandidate(signal.payload.candidate)
                // If remoteDescription isn't set yet, queue the candidate
                if (!peerConnection.remoteDescription) {
                    candidateQueue.push(candidate)
                } else {
                    await peerConnection.addIceCandidate(candidate)
                }
            }
        } catch (err) {
            console.error('Error handling WebRTC signal:', err)
        }
    })

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            try {
                const candidateJson = candidate.toJSON()
                pairingChannel.send({
                    type: 'broadcast',
                    event: 'webrtc',
                    payload: {
                        type: 'ice-candidate',
                        payload: { candidate: candidateJson },
                    },
                })
            } catch (error) {
                console.error('Error sending ICE candidate:', error)
            }
        }
    }

    return pairingChannel
}

export const setupPeerConnection = async (
    stream: MediaStream,
    pairingChannel: RealtimeChannel,
    candidateQueue: RTCIceCandidate[],
) => {
    if (!stream) {
        throw new Error('No media stream provided')
    }

    const peerConnection = createPeerConnection()
    const configuredChannel = setupWebRTCHandlers(
        peerConnection,
        pairingChannel,
        candidateQueue,
    )

    try {
        // Add tracks to peer connection
        stream.getTracks().forEach(track => {
            try {
                peerConnection.addTrack(track, stream)
            } catch (error) {
                console.error('Error adding track to peer connection:', error)
                throw error
            }
        })

        // Create and send offer
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)

        await configuredChannel.send({
            type: 'broadcast',
            event: 'webrtc',
            payload: {
                type: 'offer',
                payload: { offer },
            },
        })

        return { peerConnection, configuredChannel }
    } catch (error) {
        console.error('Error setting up peer connection:', error)
        stopMediaStream(stream)
        throw error
    }
}
