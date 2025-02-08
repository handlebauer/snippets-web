import { CHANNEL_CONFIG } from '@/constants/webrtc'

import type { VideoProcessingSignal } from '@/types/webrtc'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

export const handleVideoProcessing = async (
    formData: FormData,
    channel: RealtimeChannel,
) => {
    const sendProcessingStatus = async (signal: VideoProcessingSignal) => {
        try {
            await channel.send({
                type: 'broadcast',
                event: 'video_processing',
                payload: signal,
            })
        } catch (error) {
            console.error('Failed to send video processing status:', error)
        }
    }

    try {
        await sendProcessingStatus({
            type: 'video_processing',
            status: 'processing',
        })

        const response = await fetch('/api/videos/upload', {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            const errorData = await response.json()
            await sendProcessingStatus({
                type: 'video_processing',
                status: 'error',
                error: errorData.error || response.statusText,
            })
            throw new Error(
                `Failed to upload video: ${errorData.error || response.statusText}`,
            )
        }

        const data = await response.json()
        await sendProcessingStatus({
            type: 'video_processing',
            status: 'completed',
            videoId: data.video.id,
        })
    } catch (error) {
        await sendProcessingStatus({
            type: 'video_processing',
            status: 'error',
            error:
                error instanceof Error
                    ? error.message
                    : 'Failed to process video',
        })
    }
}

export const setupVideoChannel = async (
    supabase: SupabaseClient,
    accessCode: string,
) => {
    const videoChannel = supabase.channel(`video:${accessCode}`, {
        config: CHANNEL_CONFIG,
    })

    await new Promise<RealtimeChannel>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Video channel subscription timeout'))
        }, 5000)

        videoChannel.subscribe(status => {
            if (status === 'SUBSCRIBED') {
                clearTimeout(timeout)
                resolve(videoChannel)
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                clearTimeout(timeout)
                reject(
                    new Error(`Video channel subscription failed: ${status}`),
                )
            }
        })
    })

    return videoChannel
}

export const setupRecorder = (
    stream: MediaStream,
    pairingCode: string,
    onRecordingComplete: (formData: FormData) => Promise<void>,
    onStop: () => void,
) => {
    const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = e => {
        if (e.data.size > 0) {
            chunks.push(e.data)
        }
    }

    recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const formData = new FormData()
        const filename = `screen-recording-${new Date().toISOString()}.webm`
        formData.append('video', blob, filename)
        formData.append('sessionCode', pairingCode)

        await onRecordingComplete(formData)
        onStop()
    }

    return recorder
}
