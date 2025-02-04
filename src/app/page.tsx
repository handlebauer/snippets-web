'use client'

import { useState } from 'react'

import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp'

export default function Home() {
    const [accessCode, setAccessCode] = useState('')
    const [isPairing, setIsPairing] = useState(false)
    const [error, setError] = useState('')

    const handlePairDevice = async (e: React.FormEvent) => {
        e.preventDefault()
        if (accessCode.length !== 6) {
            setError('Please enter a complete access code')
            return
        }

        setIsPairing(true)
        setError('')

        try {
            // TODO: Implement actual pairing logic here
            // This would connect to your backend service
            console.log('Attempting to pair with code:', accessCode)
        } catch (error) {
            setError('Failed to pair device. Please try again.')
            console.error('Pairing error:', error)
        } finally {
            setIsPairing(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
            <main className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold mb-4">
                        Screen Sharing Pair
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Enter the 6-digit access code from your mobile app
                    </p>
                </div>

                <form onSubmit={handlePairDevice} className="space-y-6">
                    <div className="flex flex-col items-center space-y-4">
                        <InputOTP
                            value={accessCode}
                            onChange={value => setAccessCode(value)}
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
                        {error && (
                            <p className="text-red-500 text-sm mt-2">{error}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isPairing}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold 
                                 py-3 px-4 rounded-lg transition-colors duration-200
                                 disabled:bg-blue-400 disabled:cursor-not-allowed"
                    >
                        {isPairing ? 'Pairing...' : 'Connect'}
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
            </main>
        </div>
    )
}
