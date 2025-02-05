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

export interface VideoProcessingSignal {
    type: 'video_processing'
    status: 'processing' | 'completed' | 'error'
    videoId?: string
    error?: string
}

export interface VideoMetadata {
    id: string
    name: string
    duration: number
    size: number
    storage_path: string
    mime_type: string
    created_at: string
}

export interface ScreenShareState {
    isSharing: boolean
    isPairing: boolean
    error: string | null
    accessCode: string
    isRecording: boolean
}
