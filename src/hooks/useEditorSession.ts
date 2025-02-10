'use client'

import { useCallback, useEffect, useState } from 'react'

import { useEventManager } from './editor/useEventManager'
import { usePairing } from './usePairing'

type SessionMode = 'REALTIME' | 'PLAYBACK' | 'ARCHIVE'

type ChangeType = 'insert' | 'delete' | 'replace'

interface EditorEvent {
    type: ChangeType
    timestamp: number
    from: number
    to: number
    text: string
    removed?: string
    metadata?: {
        isSignificant?: boolean
        changeSize?: number
        description?: string
    }
}

interface EditorState {
    isConnected: boolean
    isPairing: boolean
    error: string | null
    pairingCode: string
    content: string
    isInitialContentSet: boolean
    mode: SessionMode
    isRecording: boolean
    sessionType: string | null
}

export function useEditorSession() {
    const {
        state: pairingState,
        channel,
        handlePairDevice,
        cleanup,
    } = usePairing()

    // Initialize state from localStorage if available
    const [state, setState] = useState<EditorState>(() => {
        const sessionData = localStorage.getItem('editorSession')
        if (sessionData) {
            const { pairingCode, sessionType } = JSON.parse(sessionData)
            if (sessionType === 'code_editor') {
                console.log('📥 [useEditorSession] Restoring from storage:', {
                    pairingCode,
                    sessionType,
                })
                return {
                    isConnected: true,
                    isPairing: false,
                    error: null,
                    pairingCode,
                    content: '',
                    isInitialContentSet: false,
                    mode: 'REALTIME',
                    isRecording: false,
                    sessionType,
                }
            }
        }
        return {
            isConnected: false,
            isPairing: false,
            error: null,
            pairingCode: '',
            content: '',
            isInitialContentSet: false,
            mode: 'REALTIME',
            isRecording: false,
            sessionType: null,
        }
    })

    // Use our event manager hook
    const { queueEvent } = useEventManager({
        channel,
        isConnected: state.isConnected,
        pairingCode: state.pairingCode,
        content: state.content,
        mode: state.mode,
        isRecording: state.isRecording,
    })

    // Clean up both editor state and pairing
    const handleCleanup = useCallback(() => {
        console.log('🔚 [useEditorSession] Cleaning up session')
        cleanup()
        setState({
            isConnected: false,
            isPairing: false,
            error: null,
            pairingCode: '',
            content: '',
            isInitialContentSet: false,
            mode: 'REALTIME',
            isRecording: false,
            sessionType: null,
        })
    }, [cleanup])

    // Update session type when pairing succeeds
    useEffect(() => {
        if (pairingState.sessionType === 'code_editor') {
            console.log(
                '🔄 [useEditorSession] Updating session type from pairing:',
                {
                    newSessionType: pairingState.sessionType,
                    currentSessionType: state.sessionType,
                },
            )
            setState(prev => ({
                ...prev,
                sessionType: pairingState.sessionType,
                pairingCode: pairingState.pairingCode,
            }))
        }
    }, [pairingState.sessionType, pairingState.pairingCode])

    // Listen for session type and handle editor-specific setup
    useEffect(() => {
        const sessionType = pairingState.sessionType || state.sessionType

        console.log('🔄 [useEditorSession] Effect running:', {
            sessionType,
            hasChannel: !!channel,
            isInitialContentSet: state.isInitialContentSet,
            mode: state.mode,
            connectionStatus: state.isConnected ? 'connected' : 'disconnected',
            pairingCode: pairingState.pairingCode,
        })

        if (sessionType === 'code_editor' && channel) {
            console.log(
                '📝 [useEditorSession] Setting up editor session with code:',
                pairingState.pairingCode,
            )
            setState(prev => ({
                ...prev,
                isConnected: true,
                pairingCode: pairingState.pairingCode,
            }))

            // Set up editor-specific channel listeners
            const handleEditorContent = ({
                payload,
            }: {
                payload: { content: string }
            }) => {
                console.log('📥 [useEditorSession] Received editor content:', {
                    contentLength: payload.content.length,
                    timestamp: new Date().toISOString(),
                })
                setState(prev => ({
                    ...prev,
                    content: payload.content,
                    isInitialContentSet: true,
                }))
            }

            // Handle recording started from mobile
            const handleRecordingStarted = () => {
                console.log(
                    '📱 [useEditorSession] Recording started from mobile',
                )
                setState(prev => ({ ...prev, isRecording: true }))
            }

            // Handle recording finished from mobile
            const handleRecordingFinished = () => {
                console.log(
                    '📱 [useEditorSession] Recording finished from mobile',
                )
                setState(prev => ({ ...prev, isRecording: false }))
                handleCleanup()
            }

            // Subscribe to recording events first
            channel.on(
                'broadcast',
                { event: 'editor_recording_started' },
                handleRecordingStarted,
            )

            channel.on(
                'broadcast',
                { event: 'editor_recording_finished' },
                handleRecordingFinished,
            )

            // Only subscribe to editor content if we haven't received initial content
            if (!state.isInitialContentSet) {
                console.log(
                    '🔌 [useEditorSession] Subscribing to editor_content events',
                )
                channel.on(
                    'broadcast',
                    { event: 'editor_content' },
                    handleEditorContent,
                )
            }

            // Cleanup function to remove listeners only when unmounting or session type changes
            return () => {
                // Only cleanup if we're unmounting or changing session type
                const isUnmounting = !channel
                const isChangingSessionType =
                    state.sessionType !== 'code_editor'

                if (isUnmounting || isChangingSessionType) {
                    console.log(
                        '🧹 [useEditorSession] Cleaning up channel listeners',
                        {
                            reason: isUnmounting
                                ? 'unmounting'
                                : 'session type changed',
                        },
                    )
                    channel.unsubscribe()
                }
            }
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.sessionType, pairingState.pairingCode, channel, handleCleanup])

    // Handle content updates and broadcast to channel
    const updateContent = useCallback(
        (newContent: string, event: EditorEvent) => {
            console.log('✏️ [useEditorSession] Updating content:', {
                eventType: event.type,
                timestamp: event.timestamp,
                changeSize: event.metadata?.changeSize,
                isSignificant: event.metadata?.isSignificant,
            })
            setState(prev => ({ ...prev, content: newContent }))
            queueEvent(event)
        },
        [queueEvent],
    )

    // Initialize editor and broadcast ready state
    const initialize = useCallback(() => {
        if (!channel || !state.isConnected) return

        console.log('🎬 [useEditorSession] Initializing editor')
        channel.send({
            type: 'broadcast',
            event: 'editor_initialized',
            payload: {
                timestamp: Date.now(),
                content: state.content,
            },
        })
    }, [channel, state.isConnected, state.content])

    // Signal that recording has started
    const startRecording = useCallback(() => {
        if (!channel || !state.isConnected) return

        console.log('🎥 [useEditorSession] Starting recording')
        setState(prev => ({ ...prev, isRecording: true }))
        channel.send({
            type: 'broadcast',
            event: 'editor_recording_started',
            payload: {
                timestamp: Date.now(),
                content: state.content,
            },
        })
    }, [channel, state.isConnected, state.content])

    // Signal that recording is finished
    const finishRecording = useCallback(() => {
        if (!channel || !state.isConnected) return

        console.log('🎬 [useEditorSession] Finishing recording')
        setState(prev => ({ ...prev, isRecording: false }))
        channel.send({
            type: 'broadcast',
            event: 'editor_recording_finished',
            payload: {
                timestamp: Date.now(),
                content: state.content,
            },
        })
        handleCleanup()
    }, [channel, state.isConnected, state.content, handleCleanup])

    return {
        state,
        handlePairDevice,
        updateContent,
        initialize,
        cleanup: handleCleanup,
        finishRecording,
        startRecording,
        pairingState,
    }
}
