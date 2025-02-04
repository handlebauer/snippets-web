import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp'

import type { ScreenShareState } from '@/types/webrtc'

interface ScreenSharePairingProps {
    state: ScreenShareState
    onAccessCodeChange: (code: string) => void
    onPairDevice: () => void
}

export function ScreenSharePairing({
    state,
    onAccessCodeChange,
    onPairDevice,
}: ScreenSharePairingProps) {
    return (
        <>
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-4">Screen Sharing Pair</h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Enter the 6-digit access code from your mobile app
                </p>
            </div>

            <form
                onSubmit={e => {
                    e.preventDefault()
                    onPairDevice()
                }}
                className="space-y-6"
            >
                <div className="flex flex-col items-center space-y-4">
                    <InputOTP
                        value={state.accessCode}
                        onChange={onAccessCodeChange}
                        maxLength={6}
                    >
                        <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                                <InputOTPSlot
                                    key={index}
                                    index={index}
                                    className="w-12 h-12 text-lg border-2"
                                />
                            ))}
                        </InputOTPGroup>
                    </InputOTP>
                    {state.error && (
                        <p className="text-red-500 text-sm mt-2">
                            {state.error}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={state.isPairing}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                             py-3 px-4 rounded-lg transition-colors duration-200
                             disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                    {state.isPairing ? 'Pairing...' : 'Connect'}
                </button>
            </form>

            <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Don&apos;t have the mobile app yet?</p>
                <a
                    href="#"
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                    Download it here
                </a>
            </div>
        </>
    )
}
