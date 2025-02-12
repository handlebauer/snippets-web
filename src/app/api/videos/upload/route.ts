import crypto from 'crypto'
import { promises as fs } from 'fs'
import os from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase.service'
import installedFfmpeg from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfmpegPath(installedFfmpeg.path)

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
        const channel = supabase.channel(`session:${sessionCode}`)

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
                                    c =>
                                        c.user_id && c.client_type === 'mobile',
                                )

                                console.log('👥 Client validation:', {
                                    foundMobile: !!mobileClient,
                                    mobileUserId: mobileClient?.user_id,
                                })

                                if (!mobileClient?.user_id) {
                                    console.error(
                                        '❌ No authenticated mobile client found in session',
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
        const { outputBuffer, thumbnailBuffer } = await new Promise<{
            outputBuffer: Buffer
            thumbnailBuffer: Buffer
        }>(async (resolve, reject) => {
            try {
                // Create a temporary file for the output
                const tempDir = await fs.mkdtemp(join(os.tmpdir(), 'video-'))
                const outputPath = join(tempDir, 'output.mp4')
                const thumbnailPath = join(tempDir, 'thumbnail.jpg')
                console.log('📁 Using temporary files:', {
                    video: outputPath,
                    thumbnail: thumbnailPath,
                })

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

                // Generate thumbnail from the converted video
                console.log('🖼️ Generating thumbnail...')
                await new Promise<void>((resolveThumbnail, rejectThumbnail) => {
                    ffmpeg(outputPath)
                        .screenshots({
                            timestamps: ['10%'], // Take thumbnail at 10% of the video
                            filename: 'thumbnail.jpg',
                            folder: tempDir,
                            size: '480x?', // Width 480px, maintain aspect ratio
                        })
                        .on('error', err => {
                            console.error('❌ Thumbnail generation error:', err)
                            rejectThumbnail(err)
                        })
                        .on('end', () => {
                            console.log('✅ Thumbnail generation complete')
                            resolveThumbnail()
                        })
                })

                // Read the output files
                const [videoBuffer, thumbBuffer] = await Promise.all([
                    fs.readFile(outputPath),
                    fs.readFile(thumbnailPath),
                ])
                console.log('📊 Output sizes:', {
                    video: videoBuffer.length,
                    thumbnail: thumbBuffer.length,
                })

                // Clean up
                await fs.rm(tempDir, { recursive: true, force: true })
                console.log('🧹 Cleaned up temporary files')

                resolve({
                    outputBuffer: videoBuffer,
                    thumbnailBuffer: thumbBuffer,
                })
            } catch (err) {
                reject(err)
            }
        })

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
                    // Keep full precision of duration instead of rounding
                    const duration = data.format.duration || 0
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

        // Upload both video and thumbnail to Supabase Storage
        const fileName = `video_${Date.now()}`
        const videoId = crypto.randomUUID() // Generate UUID for the video folder
        const videoPath = `${videoId}/${fileName}.mp4`
        const thumbnailPath = `${videoId}/${fileName}_thumb.jpg`

        console.log('☁️ Uploading files to storage...')
        const [videoUpload, thumbnailUpload] = await Promise.all([
            supabase.storage.from('videos').upload(videoPath, outputBuffer, {
                contentType: 'video/mp4',
                cacheControl: '3600',
            }),
            supabase.storage
                .from('videos')
                .upload(thumbnailPath, thumbnailBuffer, {
                    contentType: 'image/jpeg',
                    cacheControl: '3600',
                }),
        ])

        if (videoUpload.error || thumbnailUpload.error) {
            console.error('❌ Storage upload failed:', {
                video: videoUpload.error,
                thumbnail: thumbnailUpload.error,
            })
            return NextResponse.json(
                { error: 'Failed to upload video' },
                { status: 500 },
            )
        }

        console.log('✅ Storage upload complete:', {
            video: videoUpload.data.path,
            thumbnail: thumbnailUpload.data.path,
            sizes: {
                video: outputBuffer.length,
                thumbnail: thumbnailBuffer.length,
            },
        })

        // Get public URLs for the uploaded files
        const {
            data: { publicUrl: thumbnailUrl },
        } = supabase.storage.from('videos').getPublicUrl(thumbnailPath)

        // Get the user ID from the mobile client's presence data
        const userId = presenceData.user_id

        // Get the repository from the recording session
        const { data: sessionData, error: repoError } = await supabase
            .from('recording_sessions')
            .select('linked_repo')
            .eq('code', sessionCode)
            .single()

        console.log('🔍 Session code:', sessionCode)
        console.log('🔍 Repository data:', sessionData)

        if (repoError) {
            console.warn('⚠️ Failed to fetch repository data:', repoError)
            // Continue without repository data as it's optional
        }

        // Insert video metadata into the database
        console.log('💾 Saving video metadata to database...')
        const { data: videoData, error: dbError } = await supabase
            .from('videos')
            .insert({
                id: videoId,
                profile_id: userId,
                name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
                storage_path: videoPath,
                thumbnail_url: thumbnailUrl,
                duration: metadata.duration,
                size: outputBuffer.length,
                mime_type: 'video/mp4',
                trim_end: metadata.duration,
                linked_repo: sessionData?.linked_repo || null, // Add repository if available
            })
            .select()
            .single()

        if (dbError) {
            console.error('❌ Database insert failed:', dbError)
            // Clean up the uploaded files if database insert fails
            console.log('🧹 Cleaning up uploaded files...')
            await Promise.all([
                supabase.storage.from('videos').remove([videoUpload.data.path]),
                supabase.storage
                    .from('videos')
                    .remove([thumbnailUpload.data.path]),
            ])

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
            thumbnail: videoData.thumbnail_url,
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
