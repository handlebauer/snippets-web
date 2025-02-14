'use client'

import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/contexts/channel-context'

import { useEventManager } from './editor/useEventManager'

// Types
type SessionMode = 'REALTIME' | 'PLAYBACK' | 'ARCHIVE'
type ChangeType = 'insert' | 'delete' | 'replace'

export interface EditorEvent {
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
    isNarrating: boolean
    events: EditorEvent[]
}

// Constants
const INITIAL_EDITOR_STATE: EditorState = {
    content: '',
    initialContent: null,
    isInitialContentSet: false,
    mode: 'REALTIME',
    isRecording: false,
    isNarrating: false,
    events: [],
}

// Channel event types
type EditorContentPayload = { content: string }
type BroadcastEvent =
    | 'editor_recording_started'
    | 'editor_recording_finished'
    | 'editor_content'
    | 'editor_initialized'
    | 'narration_started'
    | 'narration_stopped'

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
                events: prev.isRecording
                    ? [...prev.events, event]
                    : prev.events,
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
            initialContent: string
            events: EditorEvent[]
        }> = {
            type: 'broadcast',
            event: 'editor_recording_finished',
            payload: {
                timestamp: Date.now(),
                content: state.content,
                initialContent: state.initialContent || state.content,
                events: state.events,
            },
        }
        channel.send(message)

        // Delay cleanup to ensure mobile app receives and processes the event
        setTimeout(() => {
            console.log(
                '🧹 [useEditorSession] Delayed cleanup after recording finished',
            )
            handleCleanup()
        }, 1000)
    }, [
        channel,
        channelState.isConnected,
        state.content,
        state.initialContent,
        state.events,
        handleCleanup,
    ])

    console.log('🎙️ [useEditorSession] State:', state)

    // Add after finishRecording function
    const toggleNarration = useCallback(() => {
        if (!channel || !channelState.isConnected) return

        const newNarrationState = !state.isNarrating
        console.log(
            `🎙️ [useEditorSession] ${newNarrationState ? 'Starting' : 'Stopping'} narration`,
        )

        setState(prev => ({ ...prev, isNarrating: newNarrationState }))

        const message: BroadcastMessage<{ timestamp: number }> = {
            type: 'broadcast',
            event: newNarrationState
                ? 'narration_started'
                : 'narration_stopped',
            payload: {
                timestamp: Date.now(),
            },
        }
        channel.send(message)
    }, [channel, channelState.isConnected, state.isNarrating])

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
                // Don't cleanup - let the web app show post recording view
            }

            // Add after handleRecordingFinished in the channel event handlers
            const handleNarrationStarted = () => {
                console.log(
                    '�� [useEditorSession] Narration started from mobile',
                )
                setState(prev => ({ ...prev, isNarrating: true }))
            }

            const handleNarrationStopped = () => {
                console.log(
                    '📱 [useEditorSession] Narration stopped from mobile',
                )
                setState(prev => ({ ...prev, isNarrating: false }))
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

            // Subscribe to narration events
            channel.on(
                'broadcast',
                { event: 'narration_started' },
                handleNarrationStarted,
            )
            channel.on(
                'broadcast',
                { event: 'narration_stopped' },
                handleNarrationStopped,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        channelState.sessionType,
        channelState.pairingCode,
        channel,
        handleCleanup,
    ])

    return {
        state: {
            ...channelState,
            ...state,
        },
        updateContent,
        initialize,
        finishRecording,
        startRecording,
        toggleNarration,
        cleanup: handleCleanup,
        handlePairDevice,
    }
}
