'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useChannel } from '../contexts/channel-context'
import { useEditorSession } from './useEditorSession'
import { useScreenSession } from './useScreenSession'

import type { EditorEvent } from './useEditorSession'

// Types
type SessionType = 'screen_recording' | 'code_editor' | null

interface SessionState {
    isSharing: boolean
    isRecording: boolean
}

interface ExtendedSessionState extends SessionState {
    isConnected: boolean
    isPairing: boolean
    error: string | null
    pairingCode: string
    sessionType: SessionType
}

interface EditorSessionAPI {
    content: string
    isRecording: boolean
    isNarrating: boolean
    updateContent: (content: string, event: EditorEvent) => void
    initialize: () => void
    finishRecording: () => void
    startRecording: () => void
    toggleNarration: () => void
}

interface ScreenSessionAPI {
    isSharing: boolean
    isRecording: boolean
    startSharing: () => Promise<void>
    stopSharing: () => void
}

// Constants
const INITIAL_SESSION_STATE: SessionState = {
    isSharing: false,
    isRecording: false,
}

export function useSession() {
    const [localState, setLocalState] = useState<SessionState>(
        INITIAL_SESSION_STATE,
    )
    const editorSession = useEditorSession()
    const screenSession = useScreenSession()
    const { state: channelState } = useChannel()

    // Combined state management
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

    // Device pairing handler
    const handlePairDevice = useCallback(
        async (code: string) => {
            try {
                // Try both session types - the correct one will activate based on the mobile app's signal
                await Promise.all([
                    editorSession.handlePairDevice(code),
                    screenSession.handlePairDevice(code),
                ])
            } catch (error) {
                console.error('❌ Pairing error:', error)
                throw error
            }
        },
        [editorSession, screenSession],
    )

    // Session state synchronization
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
                const shouldUpdate =
                    prev.isRecording !== screenRecording ||
                    prev.isSharing !== screenSharing
                return shouldUpdate
                    ? {
                          ...prev,
                          isSharing: screenSharing,
                          isRecording: screenRecording,
                      }
                    : prev
            })
        }
    }, [
        editorSession.state.sessionType,
        editorSession.state.isRecording,
        screenSession.state.sessionType,
        screenSession.state.isRecording,
        screenSession.state.isSharing,
    ])

    // Cleanup handler
    const cleanup = useCallback(() => {
        editorSession.cleanup()
        screenSession.cleanup()
        setLocalState(INITIAL_SESSION_STATE)
    }, [editorSession, screenSession])

    // Screen sharing handlers
    const startScreenSharing = useCallback(async () => {
        console.log('🎬 Starting screen sharing...', {
            currentSessionType: screenSession.state.sessionType,
        })

        if (screenSession.state.sessionType === 'screen_recording') {
            return screenSession.startSharing()
        }

        // Handle case where session type isn't set yet
        if (!screenSession.state.sessionType) {
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

    // External state update handler
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

            // Handle error propagation
            if ('error' in updates && updates.error !== combinedState.error) {
                let activeSession: 'editor' | 'screen' | null = null

                if (editorSession.state.sessionType === 'code_editor') {
                    activeSession = 'editor'
                } else if (
                    screenSession.state.sessionType === 'screen_recording'
                ) {
                    activeSession = 'screen'
                }

                if (activeSession) {
                    console.log(
                        `Updating ${activeSession} session error:`,
                        updates.error,
                    )
                }
            }

            // Log pairing code update attempts
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
        [
            combinedState,
            editorSession.state.sessionType,
            screenSession.state.sessionType,
        ],
    )

    // Session-specific API exposure
    let editorAPI: EditorSessionAPI | null = null
    if (editorSession.state.sessionType === 'code_editor') {
        editorAPI = {
            content: editorSession.state.content,
            isRecording: editorSession.state.isRecording,
            isNarrating: editorSession.state.isNarrating,
            updateContent: editorSession.updateContent,
            initialize: editorSession.initialize,
            finishRecording: editorSession.finishRecording,
            startRecording: editorSession.startRecording,
            toggleNarration: editorSession.toggleNarration,
        }
    }

    let screenAPI: ScreenSessionAPI | null = null
    if (screenSession.state.sessionType === 'screen_recording') {
        screenAPI = {
            isSharing: screenSession.state.isSharing,
            isRecording: screenSession.state.isRecording,
            startSharing: screenSession.startSharing,
            stopSharing: screenSession.stopSharing,
        }
    }

    return {
        state: combinedState,
        setState,
        handlePairDevice,
        startScreenSharing,
        stopSharing,
        cleanup,
        editor: editorAPI,
        screen: screenAPI,
    }
}
