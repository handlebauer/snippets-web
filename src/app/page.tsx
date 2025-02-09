'use client'

import { useEffect, useState } from 'react'
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
    } = useSession()
    const [isLoadingRepo, setIsLoadingRepo] = useState(false)
    const [repoData, setRepoData] = useState<RepoData[] | null>(null)
    const [supabaseClient] = useState(() => createClient())

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
                    } else {
                        setRepoData(data.repos)
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

    return (
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center">
            <main className="w-full max-w-md flex flex-col items-center p-8">
                <div className="w-full bg-[#1E1E1E] rounded-2xl p-8">
                    {state.isSharing ? (
                        <ActiveScreenShare onStopSharing={stopSharing} />
                    ) : isLoadingRepo ? (
                        <div className="text-white text-center">
                            <div className="mb-4">
                                Loading session and repository data...
                            </div>
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mx-auto"></div>
                        </div>
                    ) : repoData ? (
                        <PreRecordView
                            pairingCode={state.pairingCode}
                            onSelectScreen={startScreenSharing}
                            statusMessage="Select a repository and start recording when ready"
                            selectedScreenName={null}
                            repositories={repoData}
                        />
                    ) : (
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
                    )}
                </div>
            </main>
        </div>
    )
}
