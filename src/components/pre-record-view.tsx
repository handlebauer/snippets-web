import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase.client'
import { ArrowLeftRight, Check, Code, Monitor, Smartphone } from 'lucide-react'

import type { Database } from '@/lib/supabase.types'

interface Repository {
    name: string
    full_name: string
}

type RecordingSessionType =
    Database['public']['Enums']['recording_session_type']

interface PreRecordViewProps {
    pairingCode: string
    onSelectScreen: () => Promise<void>
    onStartEditor?: () => Promise<void>
    statusMessage: string | null
    selectedScreenName: string | null
    deviceName?: string | null
    repositories: Repository[]
    sessionType?: RecordingSessionType
}

export function PreRecordView({
    pairingCode,
    onSelectScreen,
    onStartEditor,
    statusMessage,
    deviceName,
    repositories,
    sessionType,
}: PreRecordViewProps) {
    const [selectedRepo, setSelectedRepo] = useState<string>('')
    const [error, setError] = useState<string | null>(null)
    const [supabaseClient] = useState(() => createClient())

    useEffect(() => {
        console.log('🎨 [PreRecordView] Session type changed:', {
            sessionType,
            pairingCode,
            hasStartEditor: !!onStartEditor,
        })
    }, [sessionType, pairingCode, onStartEditor])

    const handleRepoSelect = async (repo: string) => {
        setSelectedRepo(repo)

        // Update the recording session with the selected repo using RPC
        const { error: updateError } = await supabaseClient.rpc(
            'update_session_repository',
            {
                pairing_code: pairingCode,
                repository_name: repo,
            },
        )

        if (updateError) {
            console.error('Failed to update recording session:', updateError)
            setError('Failed to update repository selection')
        }

        console.log('Updated recording session:', {
            code: pairingCode,
            linked_repo: repo,
            type: sessionType,
        })
    }

    console.log('🎨 [PreRecordView] Rendering with:', {
        sessionType,
        selectedRepo,
        error,
        hasStartEditor: !!onStartEditor,
    })

    return (
        <div className="text-center">
            <div className="flex justify-center items-center gap-4 mb-4">
                <Smartphone className="w-6 h-6 text-white" />
                <ArrowLeftRight className="w-5 h-5 text-white" />
                {sessionType === 'code_editor' ? (
                    <Code className="w-6 h-6 text-white" />
                ) : (
                    <Monitor className="w-6 h-6 text-white" />
                )}
            </div>
            <div className="flex items-center justify-center gap-3 mb-2">
                <div className="flex items-center justify-center bg-green-500/10 rounded-full p-0.5">
                    <Check className="w-4 h-4 text-green-500" />
                </div>
                <h2 className="text-white text-xl font-medium">
                    {deviceName
                        ? `Connected to ${deviceName}`
                        : 'Connected to Device'}
                </h2>
            </div>
            <p className="text-[#999999] text-[14px] mb-6">
                {statusMessage ||
                    (sessionType === 'code_editor'
                        ? 'Select a repository to start editing your code'
                        : 'Select a repository and start screen recording when ready')}
            </p>

            <div className="max-w-sm mx-auto space-y-6">
                <div className="space-y-2">
                    <label className="text-sm text-gray-400 text-left block">
                        Select Repository{' '}
                        {sessionType === 'code_editor'
                            ? '(Required)'
                            : '(Optional)'}
                    </label>
                    <div className="relative">
                        {error ? (
                            <div className="bg-red-500/10 rounded-lg p-3 text-red-400 text-sm">
                                {error}
                            </div>
                        ) : (
                            <select
                                value={selectedRepo}
                                onChange={e => handleRepoSelect(e.target.value)}
                                className="w-full bg-[#2A2A2A] text-white rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a repository</option>
                                {repositories.map(repo => (
                                    <option
                                        key={repo.full_name}
                                        value={repo.full_name}
                                    >
                                        {repo.full_name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <button
                    onClick={
                        sessionType === 'code_editor'
                            ? onStartEditor
                            : onSelectScreen
                    }
                    disabled={sessionType === 'code_editor' && !selectedRepo}
                    className="w-full bg-[#2A2A2A] hover:bg-[#3A3A3A] text-white font-medium 
                             py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {sessionType === 'code_editor'
                        ? 'Launch Code Editor'
                        : 'Start Recording'}
                </button>
            </div>
        </div>
    )
}
