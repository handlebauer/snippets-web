import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import dedent from 'dedent'
import { z } from 'zod'

const MODEL_PROVIDER: 'openai' | 'google' = 'openai'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
})

const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const model =
    MODEL_PROVIDER === 'openai'
        ? openai('gpt-4o-mini')
        : google('gemini-2.0-flash-001')

// Define the input schema for the narration request
const NarrationRequestSchema = z.object({
    timestamp: z.number(),
    eventGroup: z.object({
        events: z.array(
            z.object({
                type: z.enum(['insert', 'delete', 'replace']),
                timestamp: z.number(),
                from: z.number(),
                to: z.number(),
                text: z.string(),
                removed: z.string().optional(),
                metadata: z
                    .object({
                        isSignificant: z.boolean().optional(),
                        changeSize: z.number().optional(),
                        description: z.string().optional(),
                    })
                    .optional(),
            }),
        ),
        timestamp_start: z.number(),
        timestamp_end: z.number(),
        characterChanges: z.number(),
        context: z.object({
            before: z.string(),
            after: z.string(),
            changes: z.object({
                added: z.array(z.string()),
                removed: z.array(z.string()),
            }),
        }),
        metadata: z
            .object({
                type: z.enum([
                    'insertion',
                    'deletion',
                    'modification',
                    'mixed',
                ]),
                isSignificant: z.boolean().optional(),
                description: z.string().optional(),
            })
            .optional(),
    }),
})

// Define the output schema for the AI response
const NarrationResponseSchema = z.object({
    narration: z.string(),
    confidence: z.number(),
    metadata: z
        .object({
            tone: z.enum(['neutral', 'technical', 'educational']),
            complexity: z.enum(['simple', 'moderate', 'complex']),
        })
        .optional(),
})

const generatePrompt = ({
    events,
    context,
    metadata,
    characterChanges,
}: {
    events: z.infer<typeof NarrationRequestSchema>['eventGroup']['events']
    context: z.infer<typeof NarrationRequestSchema>['eventGroup']['context']
    metadata?: z.infer<typeof NarrationRequestSchema>['eventGroup']['metadata']
    characterChanges: number
}) => {
    // Calculate time gaps between consecutive events
    const timeGaps = events.slice(1).map((event, i) => {
        const prevEvent = events[i]
        return event.timestamp - prevEvent.timestamp
    })

    const averageGap =
        timeGaps.length > 0
            ? timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length
            : 0

    // Log time gaps for debugging
    console.log('[editor-narration] Time gaps:', {
        gaps: timeGaps,
        average: averageGap,
        numEvents: events.length,
    })

    return dedent`
    Narrate this code change session in a clear, conversational way, as though you're the developer writing it:

    Context Before:
    ${context.before}

    Context After:
    ${context.after}

    Changes Made:
    - Added: ${context.changes.added.join(', ')}
    - Removed: ${context.changes.removed.join(', ')}

    Change Type: ${metadata?.type || 'unknown'}
    Character Changes: ${characterChanges}
    Number of Events: ${events.length}
    Average Time Between Events: ${averageGap}ms

    ${metadata?.description ? `Developer's Description: ${metadata.description}` : ''}

    1. Start by telling the viewer what you've added, removed, or modified
    2. Do NOT begin your narration with "Okay" or "Alright" or any similar word
    3. Be a confident programmer and provide natural, conversational narration
    4. Assume you are speaking to users who are watching your coding session
    5. Focus on the intent and significance of the changes
    6. Favor concise, interesting narration (do not add unnecessary details)

    Consider:
    - The type and scope of changes
    - The pace of editing (gaps between events)
    - Any patterns in the changes

    - Parse for variable names and pronounce them as such, e.g.
        - \`numB = 3\` -> ✅ "num bee" (❌ numb)
        - \`hasID = false\` -> ✅ "has eye dee" (❌ "has id" like "kid")
        - \`newStr = ""\` -> ✅ "new string" (❌ "new stir/star")
    `
}

export async function POST(request: Request) {
    try {
        const json = await request.json()

        // Validate the request body
        const { eventGroup } = NarrationRequestSchema.parse(json)

        console.log('[editor-narration] Received request:', {
            eventCount: eventGroup.events.length,
            changeType: eventGroup.metadata?.type,
        })

        const prompt = generatePrompt({
            events: eventGroup.events,
            context: eventGroup.context,
            metadata: eventGroup.metadata,
            characterChanges: eventGroup.characterChanges,
        })

        console.log('[editor-narration] Generated prompt:', prompt)

        // Generate narration using AI
        const { object: narration } = await generateObject({
            // model: google('gemini-2.0-flash-001'),
            model,
            schema: NarrationResponseSchema,
            prompt,
        })

        console.log('[editor-narration] Generated narration:', {
            confidence: narration.confidence,
            metadata: narration.metadata,
            narration: narration.narration,
        })

        return new Response(JSON.stringify(narration), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('Error generating narration:', error)
        return new Response(
            JSON.stringify({ error: 'Failed to generate narration' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            },
        )
    }
}
