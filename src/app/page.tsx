'use client'

import { ActiveScreenShare } from '@/components/active-screen-share'
import { ScreenSharePairing } from '@/components/screen-share-pairing'

import { useWebRTC } from '@/hooks/useWebRTC'

export default function Home() {
    const { state, setState, handlePairDevice, stopSharing, isSharing } =
        useWebRTC()

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <main className="w-full max-w-md">
                {isSharing ? (
                    <ActiveScreenShare onStopSharing={stopSharing} />
                ) : (
                    <ScreenSharePairing
                        state={state}
                        onAccessCodeChange={code =>
                            setState(prev => ({ ...prev, accessCode: code }))
                        }
                        onPairDevice={handlePairDevice}
                    />
                )}
            </main>
        </div>
    )
}
