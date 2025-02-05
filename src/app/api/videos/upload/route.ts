import { promises as fs } from 'fs'
import os from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase.service'
import ffmpeg from 'fluent-ffmpeg'

export async function POST(request: Request) {
    console.log('📥 Received video upload request')
    try {
        // Initialize Supabase client with service role
        const supabase = createServiceClient()

        // Get the video data and session code from the request
        const formData = await request.formData()
        const file = formData.get('video') as File
        const sessionCode = formData.get('sessionCode') as string

        console.log('🎥 Video upload details:', {
            fileName: file?.name,
            fileSize: file?.size,
            fileType: file?.type,
            sessionCode,
        })

        if (!file) {
            console.error('❌ No video file provided in request')
            return NextResponse.json(
                { error: 'No video file provided' },
                { status: 400 },
            )
        }

        if (!sessionCode) {
            console.error('❌ No session code provided in request')
            return NextResponse.json(
                { error: 'No session code provided' },
                { status: 400 },
            )
        }

        // Get the channel presence info to validate the session
        console.log('🔐 Validating session:', sessionCode)
        const channel = supabase.channel(`webrtc:${sessionCode}`)

        type PresenceData = {
            presence_ref: string
            user_id?: string
            online_at?: string
            client_type?: 'web' | 'mobile'
            session_code?: string
        }

        type PresenceResult = {
            error: string | null
            data: PresenceData | null
        }

        const { error: presenceError, data: presenceData } =
            await new Promise<PresenceResult>(resolve => {
                let presenceSynced = false

                channel
                    .on('presence', { event: 'sync' }, () => {
                        console.log('📡 Presence synced')
                        presenceSynced = true
                    })
                    .subscribe(async status => {
                        console.log('📡 Channel status:', status)
                        if (status === 'SUBSCRIBED') {
                            try {
                                // Wait for presence to sync
                                const syncTimeout = setTimeout(() => {
                                    if (!presenceSynced) {
                                        resolve({
                                            error: 'Presence sync timeout',
                                            data: null,
                                        })
                                    }
                                }, 5000)

                                // Wait for presence to sync
                                while (!presenceSynced) {
                                    await new Promise(r => setTimeout(r, 100))
                                }
                                clearTimeout(syncTimeout)

                                const presence = channel.presenceState()
                                console.log('👥 Channel presence state:', {
                                    rawPresence: presence,
                                    clientCount: Object.keys(presence).length,
                                })

                                // Get all clients in the channel
                                const clients = Object.values(
                                    presence,
                                ).flat() as PresenceData[]
                                console.log('🔍 Looking for clients:', {
                                    totalClients: clients.length,
                                    clients: clients.map(c => ({
                                        type: c.client_type,
                                        hasUserId: !!c.user_id,
                                        sessionCode: c.session_code,
                                    })),
                                })

                                // Find the mobile client (should be the one with user_id)
                                const mobileClient = clients.find(
                                    c => c.user_id,
                                )

                                // Find the web client that matches our session code
                                const webClient = clients.find(
                                    c =>
                                        c.client_type === 'web' &&
                                        c.session_code === sessionCode,
                                )

                                console.log('👥 Client validation:', {
                                    foundMobile: !!mobileClient,
                                    foundWeb: !!webClient,
                                    mobileUserId: mobileClient?.user_id,
                                    webSessionCode: webClient?.session_code,
                                })

                                if (!mobileClient?.user_id || !webClient) {
                                    console.error(
                                        '❌ Missing required clients in session',
                                    )
                                    resolve({
                                        error: 'No authenticated user found in session',
                                        data: null,
                                    })
                                    return
                                }

                                resolve({
                                    error: null,
                                    data: mobileClient,
                                })
                            } catch (err) {
                                console.error(
                                    '❌ Failed to get presence data:',
                                    err,
                                )
                                resolve({
                                    error: 'Failed to get presence data',
                                    data: null,
                                })
                            }
                        } else if (
                            status === 'CLOSED' ||
                            status === 'CHANNEL_ERROR'
                        ) {
                            console.error('❌ Channel error:', status)
                            resolve({
                                error: 'Invalid session',
                                data: null,
                            })
                        }
                    })
            })

        // Clean up channel subscription
        await supabase.removeChannel(channel)
        console.log('🧹 Cleaned up channel subscription')

        if (presenceError || !presenceData?.user_id) {
            console.error('❌ Session validation failed:', {
                error: presenceError,
                hasUserId: !!presenceData?.user_id,
            })
            return NextResponse.json(
                { error: presenceError || 'Invalid session' },
                { status: 401 },
            )
        }

        console.log('✅ Session validated for user:', presenceData.user_id)

        // Convert the File to a Buffer for ffmpeg processing
        console.log('🔄 Converting file to buffer...')
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        console.log('📊 Buffer created:', {
            size: buffer.length,
            originalSize: file.size,
        })

        // Create a readable stream from the buffer
        const readableStream = Readable.from(buffer)

        // Convert webm to mp4 using fluent-ffmpeg
        console.log('🎬 Starting video conversion: webm -> mp4')
        const outputBuffer = await new Promise<Buffer>(
            async (resolve, reject) => {
                try {
                    // Create a temporary file for the output
                    const tempDir = await fs.mkdtemp(
                        join(os.tmpdir(), 'video-'),
                    )
                    const outputPath = join(tempDir, 'output.mp4')
                    console.log('📁 Using temporary file:', outputPath)

                    await new Promise<void>(
                        (resolveConversion, rejectConversion) => {
                            ffmpeg(readableStream)
                                .toFormat('mp4')
                                .videoFilters('pad=ceil(iw/2)*2:ceil(ih/2)*2')
                                .outputOptions([
                                    '-pix_fmt yuv420p',
                                    '-c:v libx264',
                                    '-preset fast',
                                    '-crf 23',
                                    '-movflags +faststart',
                                ])
                                .on('error', err => {
                                    console.error(
                                        '❌ FFmpeg conversion error:',
                                        err,
                                    )
                                    rejectConversion(err)
                                })
                                .on('end', () => {
                                    console.log('✅ Conversion to MP4 complete')
                                    resolveConversion()
                                })
                                .on('stderr', stderrLine => {
                                    console.log('🔧 FFmpeg:', stderrLine)
                                })
                                .save(outputPath)
                        },
                    )

                    // Read the output file
                    const outputBuffer = await fs.readFile(outputPath)
                    console.log('📊 Output file size:', outputBuffer.length)

                    // Clean up
                    await fs.rm(tempDir, { recursive: true, force: true })
                    console.log('🧹 Cleaned up temporary files')

                    resolve(outputBuffer)
                } catch (err) {
                    reject(err)
                }
            },
        )

        // Get duration using ffprobe after conversion
        console.log('📏 Getting video metadata...')
        const metadata = await new Promise<{ duration: number }>(
            (resolve, reject) => {
                const tempStream = Readable.from(outputBuffer)
                ffmpeg(tempStream).ffprobe((err, data) => {
                    if (err) {
                        console.error('❌ FFprobe error:', err)
                        reject(err)
                        return
                    }
                    const duration = Math.round(data.format.duration || 0)
                    console.log('ℹ️ Video metadata:', {
                        duration,
                        format: data.format,
                    })
                    resolve({
                        duration,
                    })
                })
            },
        )

        // Upload to Supabase Storage
        const fileName = `video_${Date.now()}.mp4`
        console.log('☁️ Uploading to storage:', fileName)
        const { data: storageData, error: storageError } =
            await supabase.storage
                .from('videos')
                .upload(fileName, outputBuffer, {
                    contentType: 'video/mp4',
                    cacheControl: '3600',
                })

        if (storageError) {
            console.error('❌ Storage upload failed:', storageError)
            return NextResponse.json(
                { error: 'Failed to upload video' },
                { status: 500 },
            )
        }

        console.log('✅ Storage upload complete:', {
            path: storageData.path,
            size: outputBuffer.length,
        })

        // Get the user ID from the mobile client's presence data
        const userId = presenceData.user_id

        // Insert video metadata into the database
        console.log('💾 Saving video metadata to database...')
        const { data: videoData, error: dbError } = await supabase
            .from('videos')
            .insert({
                profile_id: userId,
                name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
                storage_path: storageData.path,
                duration: metadata.duration,
                size: outputBuffer.length,
                mime_type: 'video/mp4',
            })
            .select()
            .single()

        if (dbError) {
            console.error('❌ Database insert failed:', dbError)
            // Clean up the uploaded file if database insert fails
            console.log('🧹 Cleaning up uploaded file...')
            await supabase.storage.from('videos').remove([storageData.path])

            return NextResponse.json(
                { error: 'Failed to save video metadata' },
                { status: 500 },
            )
        }

        console.log('✅ Video processing complete:', {
            id: videoData.id,
            name: videoData.name,
            size: videoData.size,
            duration: videoData.duration,
        })

        // Return the video data
        return NextResponse.json({
            success: true,
            video: videoData,
        })
    } catch (error) {
        console.error('❌ Unhandled error in video upload:', error)
        return NextResponse.json(
            { error: 'Failed to process video' },
            { status: 500 },
        )
    }
}
