'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActiveScreenShare } from '@/components/active-screen-share'
import { PreRecordView } from '@/components/pre-record-view'
import { ScreenSharePairing } from '@/components/screen-share-pairing'
import { createClient } from '@/utils/supabase.client'

import { useSession } from '@/hooks/useSession'

interface RepoData {
    name: string
    full_name: string
}

export default function Home() {
    const {
        state,
        setState,
        handlePairDevice,
        startScreenSharing,
        stopSharing,
        cleanup,
    } = useSession()
    const [isLoadingRepo, setIsLoadingRepo] = useState(false)
    const [repoData, setRepoData] = useState<RepoData[] | null>(null)
    const [supabaseClient] = useState(() => createClient())
    const router = useRouter()

    // Clear session state on home page mount only
    useEffect(() => {
        console.log('🧹 [Home] Cleaning up session state')
        localStorage.removeItem('editorSession')
        cleanup()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Empty dependency array = only run on mount

    // Add debug logging for session type changes
    useEffect(() => {
        console.log('🔄 [Home] Session state updated:', {
            sessionType: state.sessionType,
            isConnected: state.isConnected,
            pairingCode: state.pairingCode,
        })
    }, [state.sessionType, state.isConnected, state.pairingCode])

    useEffect(() => {
        if (state.pairingCode) {
            const fetchRepoData = async () => {
                setIsLoadingRepo(true)
                try {
                    const { data, error } = await supabaseClient.rpc(
                        'get_github_repos_for_session',
                        { pairing_code: state.pairingCode },
                    )
                    if (error) {
                        console.error('Failed to fetch repos:', error)
                        setState(prev => ({
                            ...prev,
                            error: 'Failed to fetch repositories',
                        }))
                    } else if (data) {
                        const repoData = (
                            data as unknown as { repos: RepoData[] }
                        ).repos
                        setRepoData(repoData)
                    }
                } catch (error) {
                    console.error('Error fetching repos:', error)
                    setState(prev => ({
                        ...prev,
                        error: 'Failed to fetch repositories',
                    }))
                } finally {
                    setIsLoadingRepo(false)
                }
            }
            fetchRepoData()
        }
    }, [state.pairingCode, setState, supabaseClient])

    // Add debug logging for render conditions
    const renderContent = () => {
        console.log('🎯 [Home] Rendering with state:', {
            isSharing: state.isSharing,
            isLoadingRepo,
            hasRepoData: !!repoData,
            sessionType: state.sessionType,
        })

        if (state.isSharing) {
            return <ActiveScreenShare onStopSharing={stopSharing} />
        }

        if (isLoadingRepo) {
            return (
                <div className="text-white text-center">
                    <div className="mb-4">
                        Loading session and repository data...
                    </div>
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mx-auto"></div>
                </div>
            )
        }

        if (repoData) {
            console.log('📝 [Home] Rendering PreRecordView with:', {
                sessionType: state.sessionType,
                pairingCode: state.pairingCode,
            })
            return (
                <PreRecordView
                    pairingCode={state.pairingCode}
                    onSelectScreen={startScreenSharing}
                    onStartEditor={async () => {
                        console.log('🚀 Starting editor session')
                        router.push(`/editor?code=${state.pairingCode}`)
                    }}
                    statusMessage={state.error || null}
                    selectedScreenName={null}
                    repositories={repoData}
                    sessionType={state.sessionType || undefined}
                />
            )
        }

        return (
            <ScreenSharePairing
                state={state}
                onPairingCodeChange={code =>
                    setState(prev => ({
                        ...prev,
                        pairingCode: code,
                    }))
                }
                onPairDevice={handlePairDevice}
            />
        )
    }

    return (
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center">
            <main className="w-full max-w-md flex flex-col items-center p-8">
                <div className="w-full bg-[#1E1E1E] rounded-2xl p-8">
                    {renderContent()}
                </div>
            </main>
        </div>
    )
}
