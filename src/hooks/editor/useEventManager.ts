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
    TIME_MS: 20 * 1000, // Every 15 seconds (down from 30)
    EVENTS: 50, // Every 50 events (down from 100)
    MIN_CHANGES: 30, // Minimum 20 character changes (down from 50)
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
            // Early return if not recording - we shouldn't even get here
            if (!isRecording) {
                console.log(
                    '⏸️ [useEventManager] Skipping batch: not recording',
                )
                return
            }

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

            // Verify we have a pairing code
            if (!pairingCode) {
                console.error('❌ [useEventManager] Missing pairing code')
                return
            }

            console.log('📤 [useEventManager] Sending batch:', {
                eventCount: batch.events.length,
                timeSpanMs: batch.timestamp_end - batch.timestamp_start,
                pairingCode,
                isRecording,
            })

            try {
                // Send batch to connected mobile client
                channel.send({
                    type: 'broadcast',
                    event: 'editor_batch',
                    payload: {
                        ...batch,
                        pairing_code: pairingCode, // Include pairing code in the batch
                    },
                })

                console.log('📱 [useEventManager] Batch sent to mobile client')

                // Store batch in database (we know we're recording at this point)
                console.log('💾 [useEventManager] Storing batch in database:', {
                    pairing_code: pairingCode,
                    event_count: batch.events.length,
                    first_event_type: batch.events[0].type,
                })

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
        [channel, isConnected, pairingCode, isRecording],
    )

    const shouldCreateSnapshot = useCallback((event: EditorEvent): boolean => {
        // Time-based tracking
        const millisecondsSinceLastSnapshot =
            Date.now() - lastSnapshotTimeRef.current
        const hasReachedTimeThreshold =
            millisecondsSinceLastSnapshot >= SNAPSHOT_THRESHOLDS.TIME_MS

        // Event-based tracking (creates snapshot every N events)
        const eventsUntilNextSnapshot =
            totalEventsRef.current % SNAPSHOT_THRESHOLDS.EVENTS
        const hasReachedEventThreshold = eventsUntilNextSnapshot === 0

        // Change-based tracking
        const totalCharacterChanges = changesSinceSnapshotRef.current
        const hasMinimumChanges =
            totalCharacterChanges >= SNAPSHOT_THRESHOLDS.MIN_CHANGES

        // Event significance
        const isSignificantEvent = event.metadata?.isSignificant ?? false

        // Only proceed if we have enough character changes
        if (hasMinimumChanges) {
            // Create snapshot if any threshold is met
            const shouldCreate =
                hasReachedTimeThreshold || // Time threshold (e.g., 15 seconds passed)
                hasReachedEventThreshold || // Event threshold (e.g., every 50 events)
                isSignificantEvent // Significant events (e.g., file saved)

            // Log snapshot evaluation details
            console.log('📸 [useEventManager] Evaluating snapshot creation:', {
                millisecondsSinceLastSnapshot,
                timeThreshold: SNAPSHOT_THRESHOLDS.TIME_MS,
                eventsUntilNextSnapshot,
                totalCharacterChanges,
                minChangesRequired: SNAPSHOT_THRESHOLDS.MIN_CHANGES,
                isSignificantEvent,
                thresholds: {
                    changes: hasMinimumChanges,
                    time: hasReachedTimeThreshold,
                    events: hasReachedEventThreshold,
                },
                shouldCreate,
            })

            // Log if we're creating a snapshot and why
            if (shouldCreate) {
                const reason = isSignificantEvent
                    ? 'significant event'
                    : hasReachedTimeThreshold
                      ? 'time threshold reached'
                      : 'event threshold reached'

                console.log('⏱️ [useEventManager] Creating snapshot:', {
                    reason,
                    millisecondsSinceLastSnapshot,
                    timeThreshold: SNAPSHOT_THRESHOLDS.TIME_MS,
                    eventsUntilNextSnapshot,
                    totalEvents: totalEventsRef.current,
                })
            }

            return shouldCreate
        }

        // Log if we don't have enough changes yet
        console.log('❌ [useEventManager] Not enough changes for snapshot:', {
            currentChanges: totalCharacterChanges,
            requiredChanges: SNAPSHOT_THRESHOLDS.MIN_CHANGES,
        })

        return false
    }, [])

    const createSnapshot = useCallback(
        async (eventIndex: number): Promise<void> => {
            console.log('🔎 [useEventManager] Entering createSnapshot:', {
                hasPairingCode: !!pairingCode,
                isConnected,
                isRecording,
                eventIndex,
            })

            if (!pairingCode || !isConnected) {
                console.warn(
                    '🔌 [useEventManager] Cannot create snapshot: not connected',
                    {
                        hasPairingCode: !!pairingCode,
                        isConnected,
                        pairingCode: pairingCode,
                    },
                )
                return
            }

            // Only create snapshots if recording
            if (!isRecording) {
                console.log(
                    '⏸️ [useEventManager] Skipping snapshot: not recording',
                    {
                        isRecording,
                        pairingCode: pairingCode,
                        isConnected,
                    },
                )
                return
            }

            // Store current counter values in case we need to restore them
            const prevChangeCount = changesSinceSnapshotRef.current
            const prevSnapshotTime = lastSnapshotTimeRef.current

            // Reset counters before attempting storage
            lastSnapshotTimeRef.current = Date.now()
            changesSinceSnapshotRef.current = 0

            console.log('📸 [useEventManager] Creating snapshot:', {
                eventIndex,
                contentLength: content.length,
                previousChanges: prevChangeCount,
                pairingCode: pairingCode,
                isRecording,
                isConnected,
            })

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
                    // Restore previous counter values on error
                    lastSnapshotTimeRef.current = prevSnapshotTime
                    changesSinceSnapshotRef.current = prevChangeCount

                    console.error(
                        '❌ [useEventManager] Failed to store snapshot:',
                        {
                            error,
                            eventIndex,
                            errorCode: error.code,
                            errorMessage: error.message,
                            errorDetails: error.details,
                            restoredCounters: {
                                changes: prevChangeCount,
                                lastSnapshot: new Date(
                                    prevSnapshotTime,
                                ).toISOString(),
                            },
                        },
                    )
                } else {
                    console.log(
                        '💾 [useEventManager] Snapshot stored successfully:',
                        {
                            eventIndex,
                            isKeyFrame: snapshot.metadata?.isKeyFrame,
                            contentLength: content.length,
                            pairingCode: pairingCode,
                            countersReset: {
                                changes: changesSinceSnapshotRef.current,
                                lastSnapshot: new Date(
                                    lastSnapshotTimeRef.current,
                                ).toISOString(),
                            },
                        },
                    )
                }
            } catch (err) {
                // Restore previous counter values on error
                lastSnapshotTimeRef.current = prevSnapshotTime
                changesSinceSnapshotRef.current = prevChangeCount

                console.error('💥 [useEventManager] Error creating snapshot:', {
                    error: err,
                    eventIndex,
                    pairingCode: pairingCode,
                    isRecording,
                    isConnected,
                    restoredCounters: {
                        changes: prevChangeCount,
                        lastSnapshot: new Date(prevSnapshotTime).toISOString(),
                    },
                })
            }
        },
        [pairingCode, isConnected, content, isRecording],
    )

    // Reset all event tracking state
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

    // Watch recording state changes to reset tracking
    useEffect(() => {
        if (isRecording) {
            console.log(
                '🎥 [useEventManager] Recording started, initializing event tracking',
            )
            resetEventTracking()
        } else {
            console.log(
                '⏹️ [useEventManager] Recording stopped, clearing event tracking',
            )
            resetEventTracking()
        }
    }, [isRecording, resetEventTracking])

    const queueEvent = useCallback(
        (event: EditorEvent) => {
            // If not recording, only sync content if channel is available
            if (!isRecording) {
                if (channel && isConnected) {
                    console.log(
                        '🔄 [useEventManager] Syncing content (not recording)',
                    )
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

            // Everything below this point only happens if we are recording
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
            const shouldCreate = shouldCreateSnapshot(event)
            console.log('🔍 [useEventManager] Snapshot decision:', {
                shouldCreate,
                isRecording,
                isConnected,
                hasPairingCode: !!pairingCode,
                totalEvents: totalEventsRef.current,
            })

            if (shouldCreate) {
                console.log(
                    '🎯 [useEventManager] Attempting to create snapshot...',
                )
                createSnapshot(totalEventsRef.current).catch(err => {
                    console.error(
                        '💥 [useEventManager] Snapshot creation promise rejected:',
                        err,
                    )
                })
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
            pairingCode,
        ],
    )

    return { queueEvent }
}
