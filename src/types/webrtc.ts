export interface WebRTCSignal {
    type: 'offer' | 'answer' | 'ice-candidate'
    payload: {
        offer?: RTCSessionDescriptionInit
        answer?: RTCSessionDescriptionInit
        candidate?: RTCIceCandidateInit
    }
}

export interface ScreenShareState {
    isSharing: boolean
    isPairing: boolean
    error: string | null
    accessCode: string
}
