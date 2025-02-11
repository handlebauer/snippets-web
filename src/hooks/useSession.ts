'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useChannel } from '../contexts/channel-context'
import { useEditorSession } from './useEditorSession'
import { useScreenSession } from './useScreenSession'

// Match the shape of the original ScreenShareState for compatibility
interface SessionState {
    isSharing: boolean
    isRecording: boolean
}

interface ExtendedSessionState extends SessionState {
    isConnected: boolean
    isPairing: boolean
    error: string | null
    pairingCode: string
    sessionType: 'screen_recording' | 'code_editor' | null
}

export function useSession() {
    const [localState, setLocalState] = useState<SessionState>({
        isSharing: false,
        isRecording: false,
    })

    const editorSession = useEditorSession()
    const screenSession = useScreenSession()
    const { state: channelState } = useChannel()

    // Memoize the combined state to prevent unnecessary re-renders
    const combinedState = useMemo(
        () => ({
            ...localState,
            isConnected:
                editorSession.state.isConnected ||
                screenSession.state.isConnected,
            isPairing: false,
            error: editorSession.state.error || screenSession.state.error,
            pairingCode: channelState.pairingCode || '',
            sessionType: channelState.sessionType,
        }),
        [
            localState,
            editorSession.state.isConnected,
            editorSession.state.error,
            channelState.pairingCode,
            channelState.sessionType,
            screenSession.state.isConnected,
            screenSession.state.error,
        ],
    )

    // Handle pairing through the appropriate session type
    const handlePairDevice = useCallback(
        async (code: string) => {
            try {
                // Try both session types - the correct one will activate based on the mobile app's signal
                await Promise.all([
                    editorSession.handlePairDevice(code),
                    screenSession.handlePairDevice(code),
                ])
            } catch (error) {
                console.error('Pairing error:', error)
                throw error
            }
        },
        [editorSession, screenSession],
    )

    // Update parent state based on active session
    useEffect(() => {
        const editorType = editorSession.state.sessionType
        const screenType = screenSession.state.sessionType
        const editorRecording = editorSession.state.isRecording
        const screenRecording = screenSession.state.isRecording
        const screenSharing = screenSession.state.isSharing

        // Only update if we have a definitive session type
        if (editorType === 'code_editor') {
            setLocalState(prev => {
                if (prev.isRecording !== editorRecording) {
                    return { ...prev, isRecording: editorRecording }
                }
                return prev
            })
        } else if (screenType === 'screen_recording') {
            setLocalState(prev => {
                if (
                    prev.isRecording !== screenRecording ||
                    prev.isSharing !== screenSharing
                ) {
                    return {
                        ...prev,
                        isSharing: screenSharing,
                        isRecording: screenRecording,
                    }
                }
                return prev
            })
        }
    }, [
        editorSession.state.sessionType,
        editorSession.state.isRecording,
        screenSession.state.sessionType,
        screenSession.state.isRecording,
        screenSession.state.isSharing,
    ])

    const cleanup = useCallback(() => {
        editorSession.cleanup()
        screenSession.cleanup()
        setLocalState({
            isSharing: false,
            isRecording: false,
        })
    }, [editorSession, screenSession])

    // For backward compatibility with useWebRTC usage
    const startScreenSharing = useCallback(async () => {
        console.log('🎬 Starting screen sharing...', {
            currentSessionType: screenSession.state.sessionType,
        })
        if (screenSession.state.sessionType === 'screen_recording') {
            return screenSession.startSharing()
        } else if (!screenSession.state.sessionType) {
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
    }, [screenSession])

    const stopSharing = useCallback(() => {
        if (screenSession.state.sessionType === 'screen_recording') {
            return screenSession.stopSharing()
        }
        console.warn('⚠️ Attempted to stop sharing in non-screen session')
    }, [screenSession])

    // Allow external state updates for specific fields
    const setState = useCallback(
        (
            updater: (
                prev: ExtendedSessionState,
            ) => Partial<ExtendedSessionState>,
        ) => {
            const updates = updater(combinedState)

            // Handle local state updates
            if ('isSharing' in updates || 'isRecording' in updates) {
                setLocalState(prev => {
                    const newState = { ...prev }
                    let hasChanges = false

                    if (
                        'isSharing' in updates &&
                        updates.isSharing !== undefined &&
                        updates.isSharing !== prev.isSharing
                    ) {
                        newState.isSharing = updates.isSharing
                        hasChanges = true
                    }

                    if (
                        'isRecording' in updates &&
                        updates.isRecording !== undefined &&
                        updates.isRecording !== prev.isRecording
                    ) {
                        newState.isRecording = updates.isRecording
                        hasChanges = true
                    }

                    return hasChanges ? newState : prev
                })
            }

            // Handle error updates by propagating to the active session
            if ('error' in updates && updates.error !== combinedState.error) {
                if (editorSession.state.sessionType === 'code_editor') {
                    // Handle error in editor session
                    console.log('Updating editor session error:', updates.error)
                } else if (
                    screenSession.state.sessionType === 'screen_recording'
                ) {
                    // Handle error in screen session
                    console.log('Updating screen session error:', updates.error)
                }
            }

            // Handle pairing code updates - only if it's actually changed
            if (
                'pairingCode' in updates &&
                updates.pairingCode !== undefined &&
                updates.pairingCode !== combinedState.pairingCode
            ) {
                console.log(
                    'Pairing code updates should be handled by ChannelContext',
                )
            }
        },
        [combinedState],
    )

    return {
        state: combinedState,
        setState,
        handlePairDevice,
        startScreenSharing,
        stopSharing,
        cleanup,
        // Expose session-specific functionality
        editor:
            editorSession.state.sessionType === 'code_editor'
                ? {
                      content: editorSession.state.content,
                      isRecording: editorSession.state.isRecording,
                      updateContent: editorSession.updateContent,
                      initialize: editorSession.initialize,
                      finishRecording: editorSession.finishRecording,
                      startRecording: editorSession.startRecording,
                  }
                : null,
        screen:
            screenSession.state.sessionType === 'screen_recording'
                ? {
                      isSharing: screenSession.state.isSharing,
                      isRecording: screenSession.state.isRecording,
                      startSharing: screenSession.startSharing,
                      stopSharing: screenSession.stopSharing,
                  }
                : null,
    }
}
