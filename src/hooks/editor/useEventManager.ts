'use client'

import { useCallback, useRef } from 'react'
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
            const currentBatchSize = eventBatchRef.current.length

            console.log('🤔 [useEventManager] Evaluating batch creation:', {
                mode,
                currentBatchSize,
                timeSinceLastBatch,
                eventThreshold: thresholds.EVENTS,
                timeThreshold: thresholds.TIME_MS,
                isSignificantEvent: event.metadata?.isSignificant,
            })

            // Always batch significant events immediately
            if (event.metadata?.isSignificant) {
                console.log(
                    '📢 [useEventManager] Creating batch for significant event',
                )
                return true
            }

            // Check time and event count thresholds based on mode
            const shouldCreate =
                currentBatchSize >= thresholds.EVENTS ||
                timeSinceLastBatch >= thresholds.TIME_MS

            if (shouldCreate) {
                console.log('⏰ [useEventManager] Batch threshold reached:', {
                    reason:
                        currentBatchSize >= thresholds.EVENTS
                            ? 'event count'
                            : 'time elapsed',
                })
            }

            return shouldCreate
        },
        [mode],
    )

    const createBatch = useCallback((): EditorBatch | null => {
        if (eventBatchRef.current.length === 0) {
            console.log(
                '⚠️ [useEventManager] Attempted to create batch with no events',
            )
            return null
        }

        console.log('📦 [useEventManager] Creating batch:', {
            eventCount: eventBatchRef.current.length,
            firstEventTime: new Date(
                eventBatchRef.current[0].timestamp,
            ).toISOString(),
            lastEventTime: new Date(
                eventBatchRef.current[
                    eventBatchRef.current.length - 1
                ].timestamp,
            ).toISOString(),
        })

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
            if (!channel || !isConnected) {
                console.warn(
                    '🔌 [useEventManager] Cannot send batch: not connected',
                    {
                        hasChannel: !!channel,
                        isConnected,
                    },
                )
                return
            }

            console.log('📤 [useEventManager] Sending batch:', {
                eventCount: batch.events.length,
                timeSpanMs: batch.timestamp_end - batch.timestamp_start,
                pairingCode,
            })

            try {
                // Send batch to connected mobile client for real-time sync
                channel.send({
                    type: 'broadcast',
                    event: 'editor_batch',
                    payload: batch,
                })

                console.log('📱 [useEventManager] Batch sent to mobile client')

                // Store batch in database using the pairing code as auth token
                console.log(
                    '💾 [useEventManager] Attempting to store batch in database:',
                    {
                        pairing_code: pairingCode,
                        event_count: batch.events.length,
                        first_event_type: batch.events[0].type,
                    },
                )

                const { data, error } = await createClient().rpc(
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
                    console.error(
                        '❌ [useEventManager] Failed to store batch:',
                        {
                            error,
                            eventCount: batch.events.length,
                            errorCode: error.code,
                            errorMessage: error.message,
                            details: error.details,
                        },
                    )
                } else {
                    console.log(
                        '💾 [useEventManager] Batch stored in database:',
                        {
                            success: true,
                            data,
                            eventCount: batch.events.length,
                            timeSpanMs:
                                batch.timestamp_end - batch.timestamp_start,
                        },
                    )
                }
            } catch (err) {
                console.error(
                    '💥 [useEventManager] Error in batch processing:',
                    {
                        error: err,
                        eventCount: batch.events.length,
                    },
                )
            }
        },
        [channel, isConnected, pairingCode],
    )

    const shouldCreateSnapshot = useCallback((event: EditorEvent): boolean => {
        const timeSinceLastSnapshot = Date.now() - lastSnapshotTimeRef.current
        const eventsSinceLastSnapshot =
            totalEventsRef.current % SNAPSHOT_THRESHOLDS.EVENTS
        const changes = changesSinceSnapshotRef.current

        console.log('📸 [useEventManager] Evaluating snapshot creation:', {
            timeSinceLastSnapshot,
            eventsSinceLastSnapshot,
            changesSinceSnapshot: changes,
            minChangesRequired: SNAPSHOT_THRESHOLDS.MIN_CHANGES,
            isSignificantEvent: event.metadata?.isSignificant,
        })

        // Always create snapshot for significant events if we have minimum changes
        if (
            event.metadata?.isSignificant &&
            changes >= SNAPSHOT_THRESHOLDS.MIN_CHANGES
        ) {
            console.log(
                '🎯 [useEventManager] Creating snapshot for significant event',
            )
            return true
        }

        // Only consider time/event thresholds if we have minimum changes
        if (changes >= SNAPSHOT_THRESHOLDS.MIN_CHANGES) {
            const shouldCreate =
                timeSinceLastSnapshot >= SNAPSHOT_THRESHOLDS.TIME_MS ||
                eventsSinceLastSnapshot === 0

            if (shouldCreate) {
                console.log(
                    '⏱️ [useEventManager] Snapshot threshold reached:',
                    {
                        reason:
                            timeSinceLastSnapshot >= SNAPSHOT_THRESHOLDS.TIME_MS
                                ? 'time elapsed'
                                : 'event count',
                    },
                )
            }

            return shouldCreate
        }

        return false
    }, [])

    const createSnapshot = useCallback(
        async (eventIndex: number): Promise<void> => {
            if (!pairingCode || !isConnected) {
                console.warn(
                    '🔌 [useEventManager] Cannot create snapshot: not connected',
                    {
                        hasPairingCode: !!pairingCode,
                        isConnected,
                    },
                )
                return
            }

            console.log('📸 [useEventManager] Creating snapshot:', {
                eventIndex,
                contentLength: content.length,
                changesSinceLastSnapshot: changesSinceSnapshotRef.current,
            })

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
                        metadata: snapshot.metadata as Json,
                    },
                )

                if (error) {
                    console.error(
                        '❌ [useEventManager] Failed to store snapshot:',
                        {
                            error,
                            eventIndex,
                        },
                    )
                } else {
                    console.log(
                        '💾 [useEventManager] Snapshot stored successfully:',
                        {
                            eventIndex,
                            isKeyFrame: snapshot.metadata?.isKeyFrame,
                        },
                    )
                    // Reset tracking counters
                    lastSnapshotTimeRef.current = Date.now()
                    changesSinceSnapshotRef.current = 0
                }
            } catch (err) {
                console.error('💥 [useEventManager] Error creating snapshot:', {
                    error: err,
                    eventIndex,
                })
            }
        },
        [pairingCode, isConnected, content],
    )

    const queueEvent = useCallback(
        (event: EditorEvent) => {
            console.log('📥 [useEventManager] Queueing event:', {
                type: event.type,
                timestamp: new Date(event.timestamp).toISOString(),
                changeSize: event.metadata?.changeSize,
                isSignificant: event.metadata?.isSignificant,
            })

            // Update tracking counters
            totalEventsRef.current++
            const charChanges = Math.abs(
                (event.text?.length || 0) - (event.removed?.length || 0),
            )
            changesSinceSnapshotRef.current += charChanges

            console.log('📊 [useEventManager] Updated counters:', {
                totalEvents: totalEventsRef.current,
                changesSinceSnapshot: changesSinceSnapshotRef.current,
                charChanges,
            })

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
                    console.log('⏰ [useEventManager] Batch timeout triggered')
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
