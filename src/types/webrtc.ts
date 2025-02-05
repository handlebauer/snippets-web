export interface WebRTCSignal {
    type: 'offer' | 'answer' | 'ice-candidate'
    payload: {
        offer?: RTCSessionDescriptionInit
        answer?: RTCSessionDescriptionInit
        candidate?: RTCIceCandidateInit
    }
}

export interface RecordingSignal {
    type: 'recording'
    action: 'start' | 'stop'
}

export interface ScreenShareState {
    isSharing: boolean
    isPairing: boolean
    error: string | null
    accessCode: string
    isRecording?: boolean
}
