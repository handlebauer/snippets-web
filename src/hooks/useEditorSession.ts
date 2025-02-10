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
        }
    })

    // Use our event manager hook
    const { queueEvent } = useEventManager({
        channel,
        isConnected: state.isConnected,
        pairingCode: state.pairingCode,
        content: state.content,
        mode: state.mode,
    })

    // Listen for session type and handle editor-specific setup
    useEffect(() => {
        console.log('🔄 [useEditorSession] Effect running:', {
            sessionType: pairingState.sessionType,
            hasChannel: !!channel,
            isInitialContentSet: state.isInitialContentSet,
            mode: state.mode,
            connectionStatus: state.isConnected ? 'connected' : 'disconnected',
            pairingCode: pairingState.pairingCode,
        })

        if (pairingState.sessionType === 'code_editor' && channel) {
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

            // Only subscribe if we haven't received initial content
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

            // Cleanup function to remove the listener
            return () => {
                console.log(
                    '🧹 [useEditorSession] Cleaning up channel subscription',
                )
                channel.unsubscribe()
            }
        }
    }, [
        pairingState.sessionType,
        pairingState.pairingCode,
        channel,
        state.isInitialContentSet,
    ])

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
        })
    }, [cleanup])

    return {
        state,
        handlePairDevice,
        updateContent,
        initialize,
        cleanup: handleCleanup,
        pairingState,
    }
}
