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
                <h1 className="text-white text-4xl font-mono mb-4">snippets</h1>
                <p className="text-gray-300 text-sm">
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
                            <InputOTPSlot
                                index={0}
                                className="w-12 h-14 text-lg bg-[#2A2A2A] text-white"
                            />
                            <InputOTPSlot
                                index={1}
                                className="w-12 h-14 text-lg bg-[#2A2A2A] text-white"
                            />
                            <InputOTPSlot
                                index={2}
                                className="w-12 h-14 text-lg bg-[#2A2A2A] text-white"
                            />
                        </InputOTPGroup>
                        <InputOTPGroup>
                            <InputOTPSlot
                                index={3}
                                className="w-12 h-14 text-lg bg-[#2A2A2A] text-white"
                            />
                            <InputOTPSlot
                                index={4}
                                className="w-12 h-14 text-lg bg-[#2A2A2A] text-white"
                            />
                            <InputOTPSlot
                                index={5}
                                className="w-12 h-14 text-lg bg-[#2A2A2A] text-white"
                            />
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
                    className="w-full bg-[#2A2A2A] hover:bg-[#3A3A3A] text-white font-medium 
                             py-3 px-4 rounded-lg transition-colors duration-200
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {state.isPairing ? 'Pairing...' : 'Connect'}
                </button>
            </form>

            <div className="mt-8 text-center text-sm">
                <p className="text-gray-400">
                    Don&apos;t have the mobile app yet?
                </p>
                <a
                    href="#"
                    className="text-gray-300 hover:text-white transition-colors duration-200"
                >
                    Download it here
                </a>
            </div>
        </>
    )
}
