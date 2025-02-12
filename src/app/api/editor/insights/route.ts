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
    developerStyle: z.object({
        timeDistribution: z.object({
            thinkingTimePercent: z.number(),
            activeEditingPercent: z.number(),
            reviewingPercent: z.number(),
        }),
        editingPatterns: z.array(z.string()),
        paceInsights: z.string(),
    }),
})

const generatePrompt = (
    initialState: string,
    finalContent: string,
    events: EditorEvent[],
) => {
    // Calculate time gaps between consecutive events
    const timeGaps = events.slice(1).map((event, i) => {
        const prevEvent = events[i] // since we sliced, i is the index in the original array
        return event.timestamp - prevEvent.timestamp
    })

    const averageGap =
        timeGaps.length > 0
            ? timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length
            : 0

    // Log time gaps for debugging
    console.log('[editor-insights] Time gaps:', {
        gaps: timeGaps,
        average: averageGap,
        numEvents: events.length,
    })

    return dedent`
    Analyze this code change session and provide insights:
            
    Initial Code:
    ${initialState}

    Final Code:
    ${finalContent}

    Number of events: ${events.length}
    Average time between edits: ${averageGap}ms

    Please analyze the changes and provide:
    1. A concise summary of what changed
    2. Key changes made (as bullet points, do not quote the code changes themselves)
    3. Code complexity assessment (before and after)
    4. Specific suggestions for improvements
    5. Developer style analysis including:
       - Time distribution (thinking vs active editing vs reviewing)
       - Identified editing patterns
       - Insights about their coding pace and style

    For the developer style analysis:
    - Gaps > 2000ms suggest thinking/planning time
    - Rapid sequential edits (gaps < 500ms) suggest active coding
    - Small adjustments after pauses suggest reviewing/refining
    - Look for patterns in edit sizes and types

    Focus on:
    - The main purpose of the changes
    - Any potential improvements in code quality
    - Performance implications
    - Best practices that could be applied
    - The human aspects of how the code was written
`
}

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
