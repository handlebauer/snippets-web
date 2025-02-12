import { createServiceClient } from '@/utils/supabase.service'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateObject } from 'ai'
import dedent from 'dedent'
import { z } from 'zod'

import { EditorEvent } from '@/hooks/useEditorSession'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
})

// Define the input schema for the insights request
const InsightsRequestSchema = z.object({
    pairingCode: z.string(),
    data: z.object({
        events: z.array(
            z.object({
                type: z.enum(['insert', 'delete', 'replace']),
                timestamp: z.number(),
                from: z.number(),
                to: z.number(),
                text: z.string(),
                removed: z.string().optional(),
            }),
        ),
        initialState: z.string(),
        finalContent: z.string(),
    }),
})

// Define the output schema for the AI response
const InsightsResponseSchema = z.object({
    summary: z.string(),
    keyChanges: z.array(z.string()),
    complexity: z.object({
        before: z.number(),
        after: z.number(),
        explanation: z.string(),
    }),
    suggestions: z.array(
        z.object({
            title: z.string(),
            description: z.string(),
            priority: z.enum(['low', 'medium', 'high']),
        }),
    ),
})

const generatePrompt = (
    initialState: string,
    finalContent: string,
    events: EditorEvent[],
) =>
    dedent`
    Analyze this code change session and provide insights:
            
    Initial Code:
    ${initialState}

    Final Code:
    ${finalContent}

    Number of events: ${events.length}

    Please analyze the changes and provide:
    1. A concise summary of what changed
    2. Key changes made (as bullet points)
    3. Code complexity assessment (before and after)
    4. Specific suggestions for improvements

    Focus on:
    - The main purpose of the changes
    - Any potential improvements in code quality
    - Performance implications
    - Best practices that could be applied
`

export async function POST(request: Request) {
    try {
        const json = await request.json()

        // Validate the request body
        const {
            pairingCode,
            data: { events, initialState, finalContent },
        } = InsightsRequestSchema.parse(json)

        console.log('[editor-insights] Received request:', {
            pairingCode,
            initialState,
            finalContent,
            events,
        })

        // Generate insights using AI
        const { object: insights } = await generateObject({
            model: google('gemini-2.0-flash-001'),
            schema: InsightsResponseSchema,
            prompt: generatePrompt(initialState, finalContent, events),
        })

        console.log('[editor-insights] Generated insights:', insights)

        // Create a Supabase service client
        const supabase = createServiceClient()

        // Store the insights in the database
        const { error: storeError } = await supabase.rpc(
            'store_editor_insights',
            {
                pairing_code: pairingCode,
                insights_data: insights,
            },
        )

        if (storeError) {
            console.error('Error storing insights:', storeError)
            throw storeError
        }

        return new Response(JSON.stringify(insights), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('Error generating insights:', error)
        return new Response(
            JSON.stringify({ error: 'Failed to generate insights' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            },
        )
    }
}
