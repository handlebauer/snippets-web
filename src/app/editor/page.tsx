'use client'

import { useCallback, useRef, useState } from 'react'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewUpdate } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'

// Constants for different modes
const SNAPSHOT_THRESHOLDS = {
    REALTIME: {
        EVENTS: 2, // Take snapshot every 2-3 events
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

type SessionMode = keyof typeof SNAPSHOT_THRESHOLDS

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

interface EditorSnapshot {
    timestamp: number
    content: string
    eventIndex: number
    metadata?: {
        isKeyFrame?: boolean
        description?: string
        memoryUsage?: number
    }
}

interface EditorState {
    mode: SessionMode
    events: EditorEvent[]
    snapshots: EditorSnapshot[]
    lastEventTime: number
    lastSnapshotTime: number
    eventsSinceSnapshot: number
}

export default function EditorPage() {
    const [code, setCode] = useState(`// Type your code here
console.log('Hello, CodeMirror!')
`)
    const [replayTimestamp, setReplayTimestamp] = useState<number | null>(null)
    const [sessionMode, setSessionMode] = useState<SessionMode>('REALTIME')

    const editorStateRef = useRef<EditorState>({
        mode: 'REALTIME',
        events: [],
        snapshots: [
            {
                timestamp: Date.now(),
                content: code,
                eventIndex: -1,
                metadata: {
                    isKeyFrame: true,
                    description: 'Initial state',
                },
            },
        ],
        lastEventTime: Date.now(),
        lastSnapshotTime: Date.now(),
        eventsSinceSnapshot: 0,
    })

    const shouldTakeSnapshot = useCallback((event: EditorEvent): boolean => {
        const state = editorStateRef.current
        const thresholds = SNAPSHOT_THRESHOLDS[state.mode]
        const timeSinceLastSnapshot = Date.now() - state.lastSnapshotTime

        // Always snapshot significant events
        if (event.metadata?.isSignificant) {
            return true
        }

        // Check time and event count thresholds based on mode
        return (
            state.eventsSinceSnapshot >= thresholds.EVENTS ||
            timeSinceLastSnapshot >= thresholds.TIME_MS
        )
    }, [])

    const isSignificantChange = useCallback(
        (prevValue: string, newValue: string, event: EditorEvent): boolean => {
            // Consider a change significant if:
            // 1. Large amount of text changed (e.g., paste operations)
            const changeSize = Math.abs(newValue.length - prevValue.length)
            if (changeSize > 50) return true

            // 2. Structural changes (new lines, indentation)
            const newLineCount = (newValue.match(/\n/g) || []).length
            const prevLineCount = (prevValue.match(/\n/g) || []).length
            if (Math.abs(newLineCount - prevLineCount) > 0) return true

            // 3. Special characters that might indicate structure
            const structuralChange = /[{}()\[\];\n]/.test(event.text)
            if (structuralChange) return true

            return false
        },
        [],
    )

    const createEvent = useCallback(
        (
            type: ChangeType,
            from: number,
            to: number,
            text: string,
            removed?: string,
            isSignificant: boolean = false,
        ): EditorEvent => {
            const event: EditorEvent = {
                type,
                timestamp: Date.now(),
                from,
                to,
                text,
                removed,
                metadata: {
                    isSignificant,
                    changeSize: text.length - (removed?.length || 0),
                },
            }

            // Update state tracking
            const state = editorStateRef.current
            state.lastEventTime = event.timestamp
            state.eventsSinceSnapshot++

            // Take a new snapshot if needed
            if (shouldTakeSnapshot(event)) {
                state.snapshots.push({
                    timestamp: event.timestamp,
                    content: code,
                    eventIndex: state.events.length,
                    metadata: {
                        isKeyFrame: isSignificant,
                        description: isSignificant
                            ? 'Significant change'
                            : 'Regular snapshot',
                    },
                })
                state.lastSnapshotTime = event.timestamp
                state.eventsSinceSnapshot = 0
            }

            return event
        },
        [code, shouldTakeSnapshot],
    )

    const analyzeChange = useCallback(
        (
            prevValue: string,
            newValue: string,
            fromA: number,
            toA: number,
            fromB: number,
            toB: number,
            inserted: string,
        ): EditorEvent => {
            const removed = prevValue.slice(fromA, toA)
            const isSignificant = isSignificantChange(prevValue, newValue, {
                type:
                    removed.length === 0
                        ? 'insert'
                        : inserted.length === 0
                          ? 'delete'
                          : 'replace',
                timestamp: Date.now(),
                from: fromA,
                to: toA,
                text: inserted,
                removed,
            })

            if (removed.length === 0 && inserted.length > 0) {
                return createEvent(
                    'insert',
                    fromA,
                    fromA,
                    inserted,
                    undefined,
                    isSignificant,
                )
            } else if (removed.length > 0 && inserted.length === 0) {
                return createEvent(
                    'delete',
                    fromA,
                    toA,
                    '',
                    removed,
                    isSignificant,
                )
            } else {
                return createEvent(
                    'replace',
                    fromA,
                    toA,
                    inserted,
                    removed,
                    isSignificant,
                )
            }
        },
        [createEvent, isSignificantChange],
    )

    const onChange = useCallback(
        (value: string, viewUpdate: ViewUpdate) => {
            const prevValue = code
            setCode(value)

            // Process each atomic change
            viewUpdate.changes.iterChanges(
                (fromA, toA, fromB, toB, inserted) => {
                    const event = analyzeChange(
                        prevValue,
                        value,
                        fromA,
                        toA,
                        fromB,
                        toB,
                        inserted.toString(),
                    )
                    editorStateRef.current.events.push(event)

                    // In REALTIME mode, we would broadcast here
                    if (editorStateRef.current.mode === 'REALTIME') {
                        console.log('Broadcasting event:', event)
                    }
                },
            )

            // Log the latest event for debugging
            const latestEvent =
                editorStateRef.current.events[
                    editorStateRef.current.events.length - 1
                ]
            console.log('Latest event:', latestEvent)
        },
        [code, analyzeChange],
    )

    const reconstructStateAtTime = useCallback((timestamp: number): string => {
        const { events, snapshots } = editorStateRef.current

        // Find the latest snapshot before the target timestamp
        let baseState = ''
        let startIndex = 0

        for (let i = snapshots.length - 1; i >= 0; i--) {
            if (snapshots[i].timestamp <= timestamp) {
                baseState = snapshots[i].content
                startIndex = snapshots[i].eventIndex + 1
                break
            }
        }

        // If no snapshot found (shouldn't happen due to initial snapshot)
        if (!baseState) {
            baseState = `// Type your code here
console.log('Hello, CodeMirror!')`
        }

        // Apply all events up to the timestamp
        return events
            .slice(startIndex)
            .filter(event => event.timestamp <= timestamp)
            .reduce((state, event) => {
                switch (event.type) {
                    case 'insert':
                        return (
                            state.slice(0, event.from) +
                            event.text +
                            state.slice(event.from)
                        )
                    case 'delete':
                        return (
                            state.slice(0, event.from) + state.slice(event.to)
                        )
                    case 'replace':
                        return (
                            state.slice(0, event.from) +
                            event.text +
                            state.slice(event.to)
                        )
                    default:
                        return state
                }
            }, baseState)
    }, [])

    const handleReplayLastChange = useCallback(() => {
        const { events } = editorStateRef.current
        if (events.length > 0) {
            const lastEvent = events[events.length - 1]
            setReplayTimestamp(lastEvent.timestamp)
            const reconstructedState = reconstructStateAtTime(
                lastEvent.timestamp,
            )
            setCode(reconstructedState)
        }
    }, [reconstructStateAtTime])

    const toggleMode = useCallback(() => {
        setSessionMode(current => {
            const modes: SessionMode[] = ['REALTIME', 'PLAYBACK', 'ARCHIVE']
            const nextIndex = (modes.indexOf(current) + 1) % modes.length
            const newMode = modes[nextIndex]
            editorStateRef.current.mode = newMode
            return newMode
        })
    }, [])

    return (
        <div className="container">
            <h1>CodeMirror Demo</h1>
            <div className="mode-toggle">
                <button onClick={toggleMode} className="mode-button">
                    Mode: {sessionMode}
                </button>
            </div>
            <div className="editor-wrapper">
                <CodeMirror
                    value={code}
                    height="500px"
                    theme={oneDark}
                    extensions={[javascript({ jsx: true })]}
                    onChange={onChange}
                />
            </div>
            <div className="debug-panel">
                <h3>Event Log Stats</h3>
                <p>Mode: {sessionMode}</p>
                <p>Total Events: {editorStateRef.current.events.length}</p>
                <p>Snapshots: {editorStateRef.current.snapshots.length}</p>
                <p>
                    Events Since Last Snapshot:{' '}
                    {editorStateRef.current.eventsSinceSnapshot}
                </p>
                <button
                    className="replay-button"
                    onClick={handleReplayLastChange}
                    disabled={editorStateRef.current.events.length === 0}
                >
                    Replay Last Change
                </button>
                {replayTimestamp && (
                    <p>
                        Replaying state at:{' '}
                        {new Date(replayTimestamp).toLocaleTimeString()}
                    </p>
                )}
            </div>
            <style jsx>{`
                .container {
                    padding: 2rem;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                h1 {
                    color: #fff;
                    margin-bottom: 1.5rem;
                }
                .mode-toggle {
                    margin-bottom: 1rem;
                }
                .mode-button {
                    background: #2a2a2a;
                    color: #fff;
                    border: 1px solid #444;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .mode-button:hover {
                    background: #3a3a3a;
                }
                .editor-wrapper {
                    border-radius: 8px;
                    overflow: hidden;
                    margin-bottom: 2rem;
                }
                :global(.cm-editor) {
                    font-size: 16px;
                }
                .debug-panel {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 1rem;
                    border-radius: 8px;
                    color: #fff;
                }
                .debug-panel h3 {
                    margin: 0 0 1rem 0;
                }
                .debug-panel p {
                    margin: 0.5rem 0;
                    font-family: monospace;
                }
                .replay-button {
                    background: #0a84ff;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    margin-top: 1rem;
                    cursor: pointer;
                    font-size: 14px;
                }
                .replay-button:disabled {
                    background: #666;
                    cursor: not-allowed;
                }
                .replay-button:hover:not(:disabled) {
                    background: #0070e0;
                }
            `}</style>
        </div>
    )
}
