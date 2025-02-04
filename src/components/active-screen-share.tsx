interface ActiveScreenShareProps {
    onStopSharing: () => void
}

export function ActiveScreenShare({ onStopSharing }: ActiveScreenShareProps) {
    return (
        <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-4">Screen Sharing Active</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
                Your screen is being shared
            </p>
            <button
                onClick={onStopSharing}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold 
                         py-3 px-4 rounded-lg transition-colors duration-200"
            >
                Stop Sharing
            </button>
        </div>
    )
}
