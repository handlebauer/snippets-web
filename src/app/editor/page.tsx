'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewUpdate } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { Code, MonitorPlay, Settings } from 'lucide-react'

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

    const handleToggleRecording = useCallback(() => {
        if (!editor) return
        if (!editor.isRecording) {
            editor.startRecording()
        } else {
            editor.finishRecording()
        }
    }, [editor])

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
