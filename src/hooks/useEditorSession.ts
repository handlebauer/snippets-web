'use client'

import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/contexts/channel-context'

import { useEventManager } from './editor/useEventManager'

// Types
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
    content: string
    initialContent: string | null
    isInitialContentSet: boolean
    mode: SessionMode
    isRecording: boolean
}

// Constants
const INITIAL_EDITOR_STATE: EditorState = {
    content: '',
    initialContent: null,
    isInitialContentSet: false,
    mode: 'REALTIME',
    isRecording: false,
}

// Channel event types
type EditorContentPayload = { content: string }
type BroadcastEvent =
    | 'editor_recording_started'
    | 'editor_recording_finished'
    | 'editor_content'
    | 'editor_initialized'

interface BroadcastMessage<T = unknown> {
    type: 'broadcast'
    event: BroadcastEvent
    payload: T
}

export function useEditorSession() {
    const {
        state: channelState,
        getChannel,
        disconnect,
        handlePairDevice,
    } = useChannel()
    const channel = getChannel()

    const [state, setState] = useState<EditorState>(INITIAL_EDITOR_STATE)

    // Event manager setup
    const { queueEvent } = useEventManager({
        channel,
        isConnected: channelState.isConnected,
        pairingCode: channelState.pairingCode || '',
        content: state.content,
        mode: state.mode,
        isRecording: state.isRecording,
    })

    // Cleanup handler
    const handleCleanup = useCallback(() => {
        console.log('🔚 [useEditorSession] Cleaning up session')
        disconnect()
        setState(INITIAL_EDITOR_STATE)
    }, [disconnect])

    // Content update handler
    const updateContent = useCallback(
        (newContent: string, event: EditorEvent) => {
            console.log('✏️ [useEditorSession] Updating content:', {
                eventType: event.type,
                timestamp: event.timestamp,
                changeSize: event.metadata?.changeSize,
                isSignificant: event.metadata?.isSignificant,
            })
            setState(prev => ({
                ...prev,
                content: newContent,
                initialContent:
                    prev.initialContent === null
                        ? newContent
                        : prev.initialContent,
            }))
            queueEvent(event)
        },
        [queueEvent],
    )

    // Session initialization
    const initialize = useCallback(() => {
        if (!channel || !channelState.isConnected) return

        console.log('🎬 [useEditorSession] Initializing editor')
        const message: BroadcastMessage<{
            timestamp: number
            content: string
        }> = {
            type: 'broadcast',
            event: 'editor_initialized',
            payload: {
                timestamp: Date.now(),
                content: state.content,
            },
        }
        channel.send(message)
    }, [channel, channelState.isConnected, state.content])

    // Recording control handlers
    const startRecording = useCallback(() => {
        if (!channel || !channelState.isConnected) return

        console.log('🎥 [useEditorSession] Starting recording')
        setState(prev => ({ ...prev, isRecording: true }))
        const message: BroadcastMessage<{
            timestamp: number
            content: string
            initialContent: string
        }> = {
            type: 'broadcast',
            event: 'editor_recording_started',
            payload: {
                timestamp: Date.now(),
                content: state.content,
                initialContent: state.initialContent || state.content,
            },
        }
        channel.send(message)
    }, [channel, channelState.isConnected, state.content, state.initialContent])

    const finishRecording = useCallback(() => {
        if (!channel || !channelState.isConnected) return

        console.log('🎬 [useEditorSession] Finishing recording')
        setState(prev => ({ ...prev, isRecording: false }))
        const message: BroadcastMessage<{
            timestamp: number
            content: string
        }> = {
            type: 'broadcast',
            event: 'editor_recording_finished',
            payload: {
                timestamp: Date.now(),
                content: state.content,
            },
        }
        channel.send(message)
        handleCleanup()
    }, [channel, channelState.isConnected, state.content, handleCleanup])

    // Channel event handlers setup
    useEffect(() => {
        console.log('🔄 [useEditorSession] Effect running:', {
            sessionType: channelState.sessionType,
            hasChannel: !!channel,
            isInitialContentSet: state.isInitialContentSet,
            mode: state.mode,
            connectionStatus: channelState.isConnected
                ? 'connected'
                : 'disconnected',
            pairingCode: channelState.pairingCode,
        })

        if (channel && channelState.sessionType === 'code_editor') {
            console.log(
                '📝 [useEditorSession] Setting up editor session:',
                channelState.pairingCode,
            )

            // Event handlers
            const handleEditorContent = ({
                payload,
            }: {
                payload: EditorContentPayload
            }) => {
                console.log('📥 [useEditorSession] Received editor content:', {
                    contentLength: payload.content.length,
                    timestamp: new Date().toISOString(),
                })
                setState(prev => ({
                    ...prev,
                    content: payload.content,
                    initialContent:
                        prev.initialContent === null
                            ? payload.content
                            : prev.initialContent,
                    isInitialContentSet: true,
                }))
            }

            const handleRecordingStarted = () => {
                console.log(
                    '📱 [useEditorSession] Recording started from mobile',
                )
                setState(prev => ({ ...prev, isRecording: true }))
            }

            const handleRecordingFinished = () => {
                console.log(
                    '📱 [useEditorSession] Recording finished from mobile',
                )
                setState(prev => ({ ...prev, isRecording: false }))
                handleCleanup()
            }

            // Subscribe to events
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

            // Subscribe to content updates if needed
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

            // Cleanup function
            return () => {
                const isUnmounting = !channel
                const isChangingSessionType =
                    channelState.sessionType !== 'code_editor'

                if (isUnmounting || isChangingSessionType) {
                    console.log(
                        '🧹 [useEditorSession] Cleaning up channel listeners:',
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
    }, [
        channelState.sessionType,
        channelState.pairingCode,
        channel,
        handleCleanup,
    ])

    return {
        state: {
            ...state,
            isConnected: channelState.isConnected,
            isPairing: false,
            error: channelState.error,
            pairingCode: channelState.pairingCode || '',
            sessionType: channelState.sessionType,
        },
        handlePairDevice,
        updateContent,
        initialize,
        cleanup: handleCleanup,
        finishRecording,
        startRecording,
    }
}
