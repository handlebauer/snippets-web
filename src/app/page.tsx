'use client'

import { ActiveScreenShare } from '@/components/active-screen-share'
import { ScreenSharePairing } from '@/components/screen-share-pairing'

import { useWebRTC } from '@/hooks/useWebRTC'

export default function Home() {
    const { state, setState, handlePairDevice, stopSharing, isSharing } =
        useWebRTC()

    return (
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center">
            <main className="w-full max-w-md flex flex-col items-center p-8">
                <div className="w-full bg-[#1E1E1E] rounded-2xl p-8">
                    {isSharing ? (
                        <ActiveScreenShare onStopSharing={stopSharing} />
                    ) : (
                        <ScreenSharePairing
                            state={state}
                            onAccessCodeChange={code =>
                                setState(prev => ({
                                    ...prev,
                                    accessCode: code,
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
