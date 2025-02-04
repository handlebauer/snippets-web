export const WEBRTC_CONFIG = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export const PRESENCE_SYNC_DELAY = 2000

export const CHANNEL_CONFIG = {
    broadcast: { self: false },
    presence: { key: 'web' },
} as const

export const MEDIA_CONSTRAINTS = {
    video: true,
    audio: true,
} as const
