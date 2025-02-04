import { ArrowLeftRight, Monitor, Smartphone } from 'lucide-react'

interface ActiveScreenShareProps {
    onStopSharing: () => void
}

export function ActiveScreenShare({ onStopSharing }: ActiveScreenShareProps) {
    return (
        <div className="text-center">
            <div className="flex justify-center items-center gap-4 mb-4">
                <Smartphone className="w-6 h-6 text-white" />
                <ArrowLeftRight className="w-5 h-5 text-white" />
                <Monitor className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-white text-xl font-medium mb-2">
                Connected to Device
            </h2>
            <p className="text-gray-400 text-sm mb-6">
                Your device is now paired
            </p>
            <button
                onClick={onStopSharing}
                className="bg-[#2A2A2A] hover:bg-[#3A3A3A] text-white font-medium 
                         py-2 px-4 rounded-lg transition-colors duration-200"
            >
                Disconnect
            </button>
        </div>
    )
}
