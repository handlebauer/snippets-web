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
    const [state, setState] = useState<EditorState>({
        isConnected: false,
        isPairing: false,
        error: null,
        pairingCode: '',
        content: '',
        isInitialContentSet: false,
        mode: 'REALTIME',
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
        })

        if (pairingState.sessionType === 'code_editor' && channel) {
            console.log('📝 [useEditorSession] Setting up editor session')
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
                setState(prev => ({
                    ...prev,
                    content: payload.content,
                    isInitialContentSet: true,
                }))
            }

            // Only subscribe if we haven't received initial content
            if (!state.isInitialContentSet) {
                channel.on(
                    'broadcast',
                    { event: 'editor_content' },
                    handleEditorContent,
                )
            }

            // Cleanup function to remove the listener
            return () => {
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
            setState(prev => ({ ...prev, content: newContent }))
            queueEvent(event)
        },
        [queueEvent],
    )

    // Clean up both editor state and pairing
    const handleCleanup = useCallback(() => {
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
        cleanup: handleCleanup,
        pairingState,
    }
}
