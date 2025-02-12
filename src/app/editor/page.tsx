'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewUpdate } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { Code, MonitorPlay, Settings, Smartphone } from 'lucide-react'

import { useSession } from '@/hooks/useSession'

interface EditorToolbarProps {
    isRecording: boolean
    onToggleRecording: () => void
}

function EditorToolbar({ isRecording, onToggleRecording }: EditorToolbarProps) {
    return (
        <div className="flex items-center justify-between px-4 py-2 bg-[#1E1E1E] border-b border-[#333333]">
            <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-[#0A84FF]" />
                <span className="text-white font-medium">Code Editor</span>
            </div>
            <div className="flex items-center gap-4">
                <button
                    onClick={onToggleRecording}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                        isRecording
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-[#2A2A2A] text-white hover:bg-[#333333]'
                    }`}
                >
                    <MonitorPlay className="w-4 h-4" />
                    <span className="text-sm font-medium">
                        {isRecording ? 'Stop Recording' : 'Record'}
                    </span>
                </button>
                <button className="p-1.5 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                    <Settings className="w-5 h-5 text-[#999999]" />
                </button>
            </div>
        </div>
    )
}

export default function EditorPage() {
    const router = useRouter()
    const { editor } = useSession()

    // Send initialization signal when component mounts
    useEffect(() => {
        if (!editor) return
        editor.initialize()
    }, [editor])

    const handleChange = useCallback(
        (value: string, viewUpdate: ViewUpdate) => {
            if (!editor) return

            // Process each atomic change
            viewUpdate.changes.iterChanges(
                (fromA, toA, fromB, toB, inserted) => {
                    const event = {
                        type:
                            fromA === toA
                                ? 'insert'
                                : toA === fromB
                                  ? 'delete'
                                  : 'replace',
                        timestamp: Date.now(),
                        from: fromA,
                        to: toA,
                        text: inserted.toString(),
                        removed: viewUpdate.state.sliceDoc(fromA, toA),
                        metadata: {
                            isSignificant: inserted.toString().includes('\n'),
                            changeSize: Math.abs(
                                inserted.length - (toA - fromA),
                            ),
                        },
                    } as const

                    editor.updateContent(value, event)
                },
            )
        },
        [editor],
    )

    // Handle escape key to exit editor
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                router.push('/')
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [router])

    const [showPostRecording, setShowPostRecording] = useState(false)
    const wasRecordingRef = useRef(false) // Track previous recording state

    // Watch for recording state changes
    useEffect(() => {
        if (!editor) return

        // Only show post recording when transitioning from recording to not recording
        if (wasRecordingRef.current && !editor.isRecording) {
            setShowPostRecording(true)
        }

        // Update previous state
        wasRecordingRef.current = editor.isRecording
    }, [editor?.isRecording, editor])

    const handleToggleRecording = useCallback(() => {
        if (!editor) return
        if (!editor.isRecording) {
            editor.startRecording()
        } else {
            editor.finishRecording()
            // No need to set showPostRecording here anymore as the effect will handle it
        }
    }, [editor])

    if (showPostRecording) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-[#1A1A1A] text-white gap-6">
                <div className="flex flex-col items-center gap-4 animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Smartphone className="w-8 h-8 text-blue-500" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <h2 className="text-2xl font-semibold">
                            Recording Complete!
                        </h2>
                        <p className="text-gray-400 text-center max-w-md">
                            Check your mobile device to save or delete the
                            recording.
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 rounded-lg bg-[#2A2A2A] text-white hover:bg-[#333333] transition-colors"
                >
                    Return Home
                </button>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-[#1A1A1A]">
            <EditorToolbar
                isRecording={editor?.isRecording ?? false}
                onToggleRecording={handleToggleRecording}
            />
            <div className="flex-1 overflow-hidden">
                <CodeMirror
                    value={editor?.content || ''}
                    height="100%"
                    theme={oneDark}
                    extensions={[javascript({ jsx: true })]}
                    onChange={handleChange}
                    className="h-full text-base"
                    placeholder="// Happy coding!"
                    autoFocus={true}
                    basicSetup={{
                        lineNumbers: true,
                        highlightActiveLineGutter: true,
                        highlightActiveLine: true,
                        foldGutter: true,
                        dropCursor: true,
                        allowMultipleSelections: true,
                        indentOnInput: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        rectangularSelection: true,
                        crosshairCursor: true,
                        highlightSelectionMatches: true,
                        closeBracketsKeymap: true,
                        defaultKeymap: true,
                        searchKeymap: true,
                        historyKeymap: true,
                        foldKeymap: true,
                        completionKeymap: true,
                        lintKeymap: true,
                    }}
                />
            </div>
        </div>
    )
}
