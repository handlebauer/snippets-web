'use client'

import { useCallback, useEffect, useState } from 'react'

import { usePairing } from './usePairing'

interface EditorState {
    isConnected: boolean
    isPairing: boolean
    error: string | null
    pairingCode: string
    content: string
    isInitialContentSet: boolean
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
    })

    // Listen for session type and handle editor-specific setup
    useEffect(() => {
        if (pairingState.sessionType === 'code_editor' && channel) {
            setState(prev => ({
                ...prev,
                isConnected: true,
                pairingCode: pairingState.pairingCode,
            }))

            // Set up editor-specific channel listeners
            channel.on(
                'broadcast',
                { event: 'editor_content' },
                ({ payload }) => {
                    if (!state.isInitialContentSet) {
                        setState(prev => ({
                            ...prev,
                            content: payload.content,
                            isInitialContentSet: true,
                        }))
                    }
                },
            )
        }
    }, [
        pairingState.sessionType,
        pairingState.pairingCode,
        channel,
        state.isInitialContentSet,
    ])

    // Handle content updates and broadcast to channel
    const updateContent = useCallback(
        (newContent: string) => {
            if (channel && state.isConnected) {
                channel.send({
                    type: 'broadcast',
                    event: 'editor_content_update',
                    payload: { content: newContent },
                })
            }
            setState(prev => ({ ...prev, content: newContent }))
        },
        [channel, state.isConnected],
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
        })
    }, [cleanup])

    return {
        state,
        handlePairDevice,
        updateContent,
        cleanup: handleCleanup,
    }
}
