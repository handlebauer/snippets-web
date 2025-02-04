'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase.client'

import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp'

import type { RealtimeChannel } from '@supabase/supabase-js'

interface WebRTCSignal {
    type: 'offer' | 'answer' | 'ice-candidate'
    payload: {
        offer?: RTCSessionDescriptionInit
        answer?: RTCSessionDescriptionInit
        candidate?: RTCIceCandidateInit
    }
}

export default function Home() {
    const [accessCode, setAccessCode] = useState('')
    const [isPairing, setIsPairing] = useState(false)
    const [error, setError] = useState('')
    const [isSharing, setIsSharing] = useState(false)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [peerConnection, setPeerConnection] =
        useState<RTCPeerConnection | null>(null)
    const [supabase] = useState(() => createClient())
    const [channel, setChannel] = useState<RealtimeChannel | null>(null)

    const initializePeerConnection = () => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        })

        pc.onicecandidate = async event => {
            if (event.candidate && channel) {
                const signal: WebRTCSignal = {
                    type: 'ice-candidate',
                    payload: { candidate: event.candidate },
                }

                // Broadcast the ICE candidate
                channel.send({
                    type: 'broadcast',
                    event: 'webrtc',
                    payload: signal,
                })
            }
        }

        pc.onconnectionstatechange = () => {
            console.log('Connection state:', pc.connectionState)
            if (pc.connectionState === 'disconnected') {
                stopSharing()
            }
        }

        return pc
    }

    useEffect(() => {
        if (!accessCode || !peerConnection) return

        // Subscribe to WebRTC signaling channel
        const newChannel = supabase.channel(`webrtc:${accessCode}`, {
            config: {
                broadcast: { self: false },
                presence: {
                    key: 'web',
                },
            },
        })

        // Listen for WebRTC signals
        newChannel.on('broadcast', { event: 'webrtc' }, async ({ payload }) => {
            const signal = payload as WebRTCSignal
            if (!peerConnection) return

            try {
                if (signal.type === 'answer' && signal.payload.answer) {
                    if (peerConnection.currentRemoteDescription) return
                    console.log('📱 Received answer from mobile device')
                    const answer = new RTCSessionDescription(
                        signal.payload.answer,
                    )
                    await peerConnection.setRemoteDescription(answer)
                } else if (
                    signal.type === 'ice-candidate' &&
                    signal.payload.candidate
                ) {
                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(signal.payload.candidate),
                    )
                }
            } catch (err) {
                console.error('Error handling signal:', err)
            }
        })

        newChannel.subscribe()
        setChannel(newChannel)

        return () => {
            supabase.removeChannel(newChannel)
            setChannel(null)
        }
    }, [accessCode, peerConnection, supabase])

    const stopSharing = () => {
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
        setIsSharing(false)
    }

    const startScreenShare = async () => {
        try {
            console.log('🎥 Requesting screen share access...')
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
            })

            const pc = initializePeerConnection()
            setPeerConnection(pc)

            mediaStream.getTracks().forEach(track => {
                pc.addTrack(track, mediaStream)
            })

            setStream(mediaStream)
            setIsSharing(true)

            // Create and set local description
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            // Send offer through broadcast
            if (channel) {
                console.log('📤 Sending WebRTC offer to mobile device')
                const signal: WebRTCSignal = {
                    type: 'offer',
                    payload: { offer },
                }

                channel.send({
                    type: 'broadcast',
                    event: 'webrtc',
                    payload: signal,
                })
            }

            // Listen for when the user stops sharing via the browser UI
            mediaStream.getVideoTracks()[0].onended = () => {
                console.log('🛑 Screen sharing stopped by user')
                stopSharing()
            }
        } catch (error) {
            console.error('Error sharing screen:', error)
            setError('Failed to start screen sharing. Please try again.')
            setIsSharing(false)
            if (peerConnection) {
                peerConnection.close()
                setPeerConnection(null)
            }
        }
    }

    const handlePairDevice = async (e: React.FormEvent) => {
        e.preventDefault()
        if (accessCode.length !== 6) {
            setError('Please enter a complete access code')
            return
        }

        setIsPairing(true)
        setError('')
        console.log('🔄 Attempting to pair with code:', accessCode)

        try {
            // Create and subscribe to the channel to check for mobile client
            const pairingChannel = supabase.channel(`webrtc:${accessCode}`, {
                config: {
                    broadcast: { self: false },
                    presence: {
                        key: 'web',
                    },
                },
            })

            // Track our own presence
            pairingChannel.subscribe(async status => {
                if (status === 'SUBSCRIBED') {
                    await pairingChannel.track({
                        online_at: new Date().toISOString(),
                    })
                }
            })

            // Wait a moment for presence sync
            await new Promise(resolve => setTimeout(resolve, 500))

            // Get the channel presence state
            const presenceState = pairingChannel.presenceState()

            // Check if there's a mobile client waiting
            const hasMobileClient = Object.values(presenceState).some(
                presence =>
                    presence.some(p => p.presence_ref.includes('mobile')),
            )

            if (!hasMobileClient) {
                console.log('❌ No mobile device found with code:', accessCode)
                setError(
                    'No mobile device waiting with this code. Please check the code and try again.',
                )
                supabase.removeChannel(pairingChannel)
                return
            }

            console.log('✅ Mobile device found, initiating screen share')
            // If we found a mobile client, start screen sharing
            await startScreenShare()
        } catch (error) {
            setError('Failed to pair device. Please try again.')
            console.error('Pairing error:', error)
        } finally {
            setIsPairing(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <main className="w-full max-w-md">
                {isSharing ? (
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold mb-4">
                            Screen Sharing Active
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Your screen is being shared
                        </p>
                        <button
                            onClick={stopSharing}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold 
                                     py-3 px-4 rounded-lg transition-colors duration-200"
                        >
                            Stop Sharing
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold mb-4">
                                Screen Sharing Pair
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                Enter the 6-digit access code from your mobile
                                app
                            </p>
                        </div>

                        <form onSubmit={handlePairDevice} className="space-y-6">
                            <div className="flex flex-col items-center space-y-4">
                                <InputOTP
                                    value={accessCode}
                                    onChange={value => setAccessCode(value)}
                                    maxLength={6}
                                >
                                    <InputOTPGroup>
                                        {Array.from({ length: 6 }).map(
                                            (_, index) => (
                                                <InputOTPSlot
                                                    key={index}
                                                    index={index}
                                                    className="w-12 h-12 text-lg border-2"
                                                />
                                            ),
                                        )}
                                    </InputOTPGroup>
                                </InputOTP>
                                {error && (
                                    <p className="text-red-500 text-sm mt-2">
                                        {error}
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isPairing}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                                         py-3 px-4 rounded-lg transition-colors duration-200
                                         disabled:bg-blue-400 disabled:cursor-not-allowed"
                            >
                                {isPairing ? 'Pairing...' : 'Connect'}
                            </button>
                        </form>

                        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            <p>Don&apos;t have the mobile app yet?</p>
                            <a
                                href="#"
                                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                                Download it here
                            </a>
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}
