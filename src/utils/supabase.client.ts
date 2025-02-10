import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
}

let supabaseInstance: ReturnType<typeof createSupabaseClient<Database>> | null =
    null

export function createClient() {
    if (supabaseInstance) return supabaseInstance

    console.log('🔧 [Supabase] Creating client with:', {
        url: supabaseUrl,
        hasAnonKey: !!supabaseAnonKey,
        timestamp: new Date().toISOString(),
    })

    // We can safely assert non-null here because we check above
    supabaseInstance = createSupabaseClient<Database>(
        supabaseUrl!,
        supabaseAnonKey!,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
            },
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
            },
        },
    )

    return supabaseInstance
}
