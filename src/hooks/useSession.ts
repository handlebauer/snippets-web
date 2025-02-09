'use client'

import { useCallback, useEffect, useState } from 'react'

import { useEditorSession } from './useEditorSession'
import { useScreenSession } from './useScreenSession'

import type { Database } from '@/lib/supabase.types'

type RecordingSessionType =
    Database['public']['Enums']['recording_session_type']

// Match the shape of the original ScreenShareState for compatibility
interface SessionState {
    isSharing: boolean
    isPairing: boolean
    error: string | null
    pairingCode: string
    isRecording: boolean
    // Add new fields
    sessionType: RecordingSessionType | null
    isConnected: boolean
}

export function useSession() {
    const [state, setState] = useState<SessionState>({
        isSharing: false,
        isPairing: false,
        error: null,
        pairingCode: '',
        isRecording: false,
        sessionType: null,
        isConnected: false,
    })

    const editorSession = useEditorSession()
    const screenSession = useScreenSession()

    // Handle pairing through the appropriate session type
    const handlePairDevice = useCallback(
        async (code: string) => {
            setState(prev => ({ ...prev, isPairing: true, error: null }))

            try {
                // Try both session types - the correct one will activate based on the mobile app's signal
                await Promise.all([
                    editorSession.handlePairDevice(code),
                    screenSession.handlePairDevice(code),
                ])

                setState(prev => ({
                    ...prev,
                    pairingCode: code,
                    isPairing: false,
                }))
            } catch (error) {
                console.error('Pairing error:', error)
                setState(prev => ({
                    ...prev,
                    error: 'Failed to pair device. Please try again.',
                    isPairing: false,
                }))
            }
        },
        [editorSession, screenSession],
    )

    // Update parent state based on active session
    useEffect(() => {
        if (editorSession.state.isConnected) {
            console.log('📝 Activating code editor session')
            setState(prev => ({
                ...prev,
                isConnected: true,
                sessionType: 'code_editor',
                pairingCode: editorSession.state.pairingCode,
                error: editorSession.state.error,
            }))
        } else if (screenSession.state.isConnected) {
            console.log('🎥 Activating screen recording session')
            setState(prev => ({
                ...prev,
                isConnected: true,
                sessionType: 'screen_recording',
                pairingCode: screenSession.state.pairingCode,
                error: screenSession.state.error,
                isSharing: screenSession.state.isSharing,
                isRecording: screenSession.state.isRecording,
            }))
        }
    }, [
        editorSession.state.isConnected,
        editorSession.state.pairingCode,
        editorSession.state.error,
        screenSession.state.isConnected,
        screenSession.state.pairingCode,
        screenSession.state.error,
        screenSession.state.isSharing,
        screenSession.state.isRecording,
    ])

    const cleanup = useCallback(() => {
        editorSession.cleanup()
        screenSession.cleanup()
        setState({
            isSharing: false,
            isPairing: false,
            error: null,
            pairingCode: '',
            isRecording: false,
            sessionType: null,
            isConnected: false,
        })
    }, [editorSession, screenSession])

    // For backward compatibility with useWebRTC usage
    const startScreenSharing = useCallback(async () => {
        console.log('🎬 Starting screen sharing...', {
            currentSessionType: state.sessionType,
        })
        if (state.sessionType === 'screen_recording') {
            return screenSession.startSharing()
        } else if (!state.sessionType) {
            // If no session type is set yet, we're likely in screen recording mode
            // This happens when the user clicks "Start Recording" before the mobile app
            // has sent the session type
            console.log(
                '📱 No session type set, defaulting to screen recording',
            )
            return screenSession.startSharing()
        }
        console.warn(
            '⚠️ Attempted to start screen sharing in non-screen session',
        )
        return Promise.resolve()
    }, [state.sessionType, screenSession])

    const stopSharing = useCallback(() => {
        if (state.sessionType === 'screen_recording') {
            return screenSession.stopSharing()
        }
        console.warn('⚠️ Attempted to stop sharing in non-screen session')
    }, [state.sessionType, screenSession])

    return {
        state,
        setState,
        handlePairDevice,
        startScreenSharing,
        stopSharing,
        cleanup,
        // Expose session-specific functionality
        editor:
            state.sessionType === 'code_editor'
                ? {
                      content: editorSession.state.content,
                      updateContent: editorSession.updateContent,
                  }
                : null,
        screen:
            state.sessionType === 'screen_recording'
                ? {
                      isSharing: screenSession.state.isSharing,
                      isRecording: screenSession.state.isRecording,
                      startSharing: screenSession.startSharing,
                      stopSharing: screenSession.stopSharing,
                  }
                : null,
    }
}
