'use client'

import { useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase.client'

import type { RealtimeChannel } from '@supabase/supabase-js'

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
    TIME_MS: 30000, // Every 30 seconds
    EVENTS: 100, // Every 100 events
    MIN_CHANGES: 50, // Minimum character changes before considering time/event thresholds
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
}

export function useEventManager({
    channel,
    isConnected,
    pairingCode,
    content,
    mode,
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

            // Always batch significant events immediately
            if (event.metadata?.isSignificant) {
                return true
            }

            // Check time and event count thresholds based on mode
            return (
                eventBatchRef.current.length >= thresholds.EVENTS ||
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
            if (!channel || !isConnected) return

            try {
                // Send batch to connected mobile client for real-time sync
                channel.send({
                    type: 'broadcast',
                    event: 'editor_batch',
                    payload: batch,
                })

                // Store batch in database using the pairing code as auth token
                const { error } = await createClient().rpc(
                    'store_editor_event_batch',
                    {
                        pairing_code: pairingCode,
                        timestamp_start: batch.timestamp_start,
                        timestamp_end: batch.timestamp_end,
                        events: batch.events,
                        event_count: batch.events.length,
                    },
                )

                if (error) {
                    console.error('Failed to store event batch:', error)
                }
            } catch (err) {
                console.error('Error sending/storing batch:', err)
            }
        },
        [channel, isConnected, pairingCode],
    )

    const shouldCreateSnapshot = useCallback((event: EditorEvent): boolean => {
        const timeSinceLastSnapshot = Date.now() - lastSnapshotTimeRef.current
        const eventsSinceLastSnapshot =
            totalEventsRef.current % SNAPSHOT_THRESHOLDS.EVENTS

        // Always create snapshot for significant events if we have minimum changes
        if (
            event.metadata?.isSignificant &&
            changesSinceSnapshotRef.current >= SNAPSHOT_THRESHOLDS.MIN_CHANGES
        ) {
            return true
        }

        // Only consider time/event thresholds if we have minimum changes
        if (
            changesSinceSnapshotRef.current >= SNAPSHOT_THRESHOLDS.MIN_CHANGES
        ) {
            return (
                timeSinceLastSnapshot >= SNAPSHOT_THRESHOLDS.TIME_MS ||
                eventsSinceLastSnapshot === 0
            )
        }

        return false
    }, [])

    const createSnapshot = useCallback(
        async (eventIndex: number): Promise<void> => {
            if (!pairingCode || !isConnected) return

            try {
                const snapshot: EditorSnapshot = {
                    timestamp: Date.now(),
                    content,
                    event_index: eventIndex,
                    metadata: {
                        isKeyFrame:
                            changesSinceSnapshotRef.current >=
                            SNAPSHOT_THRESHOLDS.MIN_CHANGES * 2,
                        description: `Snapshot after ${changesSinceSnapshotRef.current} characters changed`,
                    },
                }

                // Store snapshot in database using the pairing code as auth token
                const { error } = await createClient().rpc(
                    'store_editor_snapshot',
                    {
                        pairing_code: pairingCode,
                        event_index: snapshot.event_index,
                        timestamp: snapshot.timestamp,
                        content: snapshot.content,
                        metadata: snapshot.metadata,
                    },
                )

                if (error) {
                    console.error('Failed to store snapshot:', error)
                } else {
                    // Reset tracking counters
                    lastSnapshotTimeRef.current = Date.now()
                    changesSinceSnapshotRef.current = 0
                }
            } catch (err) {
                console.error('Error creating snapshot:', err)
            }
        },
        [pairingCode, isConnected, content],
    )

    const queueEvent = useCallback(
        (event: EditorEvent) => {
            // Update tracking counters
            totalEventsRef.current++
            changesSinceSnapshotRef.current += Math.abs(
                (event.text?.length || 0) - (event.removed?.length || 0),
            )

            eventBatchRef.current.push(event)

            // Clear any existing timeout
            if (batchTimeoutRef.current) {
                clearTimeout(batchTimeoutRef.current)
            }

            // Check if we should create a snapshot
            if (shouldCreateSnapshot(event)) {
                createSnapshot(totalEventsRef.current)
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
