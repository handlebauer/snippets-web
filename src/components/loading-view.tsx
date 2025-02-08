import { ArrowLeftRight, Check, Monitor, Smartphone } from 'lucide-react'

interface LoadingViewProps {
    message?: string
}

export function LoadingView({ message = 'Loading...' }: LoadingViewProps) {
    return (
        <div className="text-center">
            <div className="flex justify-center items-center gap-4 mb-4">
                <Smartphone className="w-6 h-6 text-white" />
                <ArrowLeftRight className="w-5 h-5 text-white" />
                <Monitor className="w-6 h-6 text-white" />
            </div>
            <div className="flex items-center justify-center gap-3 mb-2">
                <h2 className="text-white text-xl font-medium">
                    Connected to Device
                </h2>
                <div className="flex items-center justify-center bg-green-500/10 rounded-full p-0.5">
                    <Check className="w-4 h-4 text-green-500 animate-in fade-in duration-300" />
                </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-4">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">{message}</p>
            </div>
        </div>
    )
}
