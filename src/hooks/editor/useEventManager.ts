'use client'

import { useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase.client'

import type { Database } from '@/lib/supabase.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type Json =
    Database['public']['Tables']['editor_event_batches']['Row']['events']

// Constants for different modes
const BATCH_THRESHOLDS = {
    REALTIME: {
        EVENTS: 2, // Take batch every 2-3 events
        TIME_MS: 16, // Or every 16ms (60fps)
    },
    PLAYBACK: {
        EVENTS: 10, // Every 10 events for smooth scrubbing
        TIME_MS: 100, // Or every 100ms
    },
    ARCHIVE: {
        EVENTS: 100, // Every 100 events
        TIME_MS: 1000, // Or every 1s
    },
} as const

type SessionMode = keyof typeof BATCH_THRESHOLDS

// Constants for snapshot creation
const SNAPSHOT_THRESHOLDS = {
    TIME_MS: 20_000, // Every 20 seconds
    EVENTS: 50, // Every 50 events
    MIN_CHANGES: 30, // Minimum 30 character changes
} as const

// Types for our event logging system
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

interface EditorBatch {
    timestamp_start: number
    timestamp_end: number
    events: EditorEvent[]
}

interface EditorSnapshot {
    timestamp: number
    content: string
    event_index: number
    metadata?: {
        isKeyFrame?: boolean
        description?: string
    }
}

interface EventManagerConfig {
    channel: RealtimeChannel | null
    isConnected: boolean
    pairingCode: string
    content: string
    mode: SessionMode
    isRecording: boolean
}

export function useEventManager({
    channel,
    isConnected,
    pairingCode,
    content,
    mode,
    isRecording,
}: EventManagerConfig) {
    // Refs for event batching
    const eventBatchRef = useRef<EditorEvent[]>([])
    const lastBatchTimeRef = useRef<number>(Date.now())
    const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Refs for snapshot tracking
    const totalEventsRef = useRef<number>(0)
    const lastSnapshotTimeRef = useRef<number>(Date.now())
    const changesSinceSnapshotRef = useRef<number>(0)

    const shouldCreateBatch = useCallback(
        (event: EditorEvent): boolean => {
            const thresholds = BATCH_THRESHOLDS[mode]
            const timeSinceLastBatch = Date.now() - lastBatchTimeRef.current
            const currentBatchSize = eventBatchRef.current.length

            // Always batch significant events immediately
            if (event.metadata?.isSignificant ?? false) {
                return true
            }

            // Check time and event count thresholds based on mode
            return (
                currentBatchSize >= thresholds.EVENTS ||
                timeSinceLastBatch >= thresholds.TIME_MS
            )
        },
        [mode],
    )

    const createBatch = useCallback((): EditorBatch | null => {
        if (eventBatchRef.current.length === 0) return null

        const batch = {
            timestamp_start: eventBatchRef.current[0].timestamp,
            timestamp_end:
                eventBatchRef.current[eventBatchRef.current.length - 1]
                    .timestamp,
            events: [...eventBatchRef.current],
        }

        // Clear the batch
        eventBatchRef.current = []
        lastBatchTimeRef.current = Date.now()

        return batch
    }, [])

    const sendBatch = useCallback(
        async (batch: EditorBatch) => {
            if (!isRecording || !channel || !isConnected || !pairingCode) {
                return
            }

            try {
                // Send batch to connected mobile client
                channel.send({
                    type: 'broadcast',
                    event: 'editor_batch',
                    payload: {
                        ...batch,
                        pairing_code: pairingCode,
                    },
                })

                // Store batch in database
                const { error } = await createClient().rpc(
                    'store_editor_event_batch',
                    {
                        pairing_code: pairingCode,
                        timestamp_start: batch.timestamp_start,
                        timestamp_end: batch.timestamp_end,
                        events: batch.events as unknown as Json,
                        event_count: batch.events.length,
                    },
                )

                if (error) {
                    console.error('Failed to store batch:', {
                        error,
                        eventCount: batch.events.length,
                    })
                }
            } catch (err) {
                console.error('Error in batch processing:', err)
            }
        },
        [channel, isConnected, pairingCode, isRecording],
    )

    const shouldCreateSnapshot = useCallback((event: EditorEvent): boolean => {
        const millisecondsSinceLastSnapshot =
            Date.now() - lastSnapshotTimeRef.current
        const eventsUntilNextSnapshot =
            totalEventsRef.current % SNAPSHOT_THRESHOLDS.EVENTS
        const totalCharacterChanges = changesSinceSnapshotRef.current

        // Only proceed if we have enough character changes
        if (totalCharacterChanges < SNAPSHOT_THRESHOLDS.MIN_CHANGES) {
            return false
        }

        return (
            millisecondsSinceLastSnapshot >= SNAPSHOT_THRESHOLDS.TIME_MS ||
            eventsUntilNextSnapshot === 0 ||
            (event.metadata?.isSignificant ?? false)
        )
    }, [])

    const createSnapshot = useCallback(
        async (eventIndex: number): Promise<void> => {
            if (!pairingCode || !isConnected || !isRecording) {
                return
            }

            const prevChangeCount = changesSinceSnapshotRef.current
            lastSnapshotTimeRef.current = Date.now()
            changesSinceSnapshotRef.current = 0

            try {
                const snapshot: EditorSnapshot = {
                    timestamp: Date.now(),
                    content,
                    event_index: eventIndex,
                    metadata: {
                        isKeyFrame:
                            prevChangeCount >=
                            SNAPSHOT_THRESHOLDS.MIN_CHANGES * 2,
                        description: `Snapshot after ${prevChangeCount} characters changed`,
                    },
                }

                const { error } = await createClient().rpc(
                    'store_editor_snapshot',
                    {
                        pairing_code: pairingCode,
                        event_index: snapshot.event_index,
                        timestamp: snapshot.timestamp,
                        content: snapshot.content,
                        metadata: snapshot.metadata as Json,
                    },
                )

                if (error) {
                    console.error('Failed to store snapshot:', error)
                    // Restore counters on error
                    lastSnapshotTimeRef.current = Date.now()
                    changesSinceSnapshotRef.current = prevChangeCount
                }
            } catch (err) {
                console.error('Error creating snapshot:', err)
                // Restore counters on error
                lastSnapshotTimeRef.current = Date.now()
                changesSinceSnapshotRef.current = prevChangeCount
            }
        },
        [pairingCode, isConnected, content, isRecording],
    )

    const resetEventTracking = useCallback(() => {
        eventBatchRef.current = []
        totalEventsRef.current = 0
        lastSnapshotTimeRef.current = Date.now()
        changesSinceSnapshotRef.current = 0
        if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current)
            batchTimeoutRef.current = null
        }
    }, [])

    useEffect(() => {
        if (isRecording) {
            resetEventTracking()
        } else {
            resetEventTracking()
        }
    }, [isRecording, resetEventTracking])

    const queueEvent = useCallback(
        (event: EditorEvent) => {
            // If not recording, only sync content
            if (!isRecording) {
                if (channel && isConnected) {
                    channel.send({
                        type: 'broadcast',
                        event: 'editor_content',
                        payload: {
                            content,
                            timestamp: Date.now(),
                        },
                    })
                }
                return
            }

            // Update tracking counters
            totalEventsRef.current++
            const charChanges = Math.abs(
                (event.text?.length || 0) - (event.removed?.length || 0),
            )
            changesSinceSnapshotRef.current += charChanges

            eventBatchRef.current.push(event)

            // Clear any existing timeout
            if (batchTimeoutRef.current) {
                clearTimeout(batchTimeoutRef.current)
            }

            // Check if we should create a snapshot
            if (shouldCreateSnapshot(event)) {
                createSnapshot(totalEventsRef.current).catch(console.error)
            }

            if (shouldCreateBatch(event)) {
                const batch = createBatch()
                if (batch) sendBatch(batch)
            } else {
                // Set a new timeout for the current mode's time threshold
                batchTimeoutRef.current = setTimeout(() => {
                    const batch = createBatch()
                    if (batch) sendBatch(batch)
                }, BATCH_THRESHOLDS[mode].TIME_MS)
            }
        },
        [
            isRecording,
            channel,
            isConnected,
            content,
            shouldCreateBatch,
            createBatch,
            sendBatch,
            mode,
            shouldCreateSnapshot,
            createSnapshot,
        ],
    )

    return { queueEvent }
}
