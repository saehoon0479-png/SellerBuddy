import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { validateImageFile, getFileExtension } from '@/lib/utils/upload'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Read Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // Verify token using Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get user plan from profiles
    const serviceClient = createServiceClient()
    const { data: profileData, error: profileError } = await serviceClient
      .schema('public')
      .from('profiles')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError || !profileData) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Determine image limit based on plan
    const imageLimit = profileData.plan === 'pro' ? 3 : 1

    // Parse multipart form data
    const formData = await request.formData()
    const imageFiles = formData.getAll('images') as File[]

    // Validate file count
    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      )
    }

    if (imageFiles.length > imageLimit) {
      return NextResponse.json(
        {
          code: 'image_limit_exceeded',
          error: `Maximum ${imageLimit} image(s) allowed for ${profileData.plan} plan`,
          limit: imageLimit,
        },
        { status: 403 }
      )
    }

    // Validate each file
    for (const file of imageFiles) {
      const validation = validateImageFile(file)
      if (!validation.valid) {
        if (file.size > 8 * 1024 * 1024) {
          return NextResponse.json(
            { error: validation.error },
            { status: 413 }
          )
        }
        return NextResponse.json(
          { error: validation.error },
          { status: 415 }
        )
      }
    }

    // Upload files to Supabase Storage
    const imagePaths: string[] = []
    const uploadErrors: string[] = []

    for (const file of imageFiles) {
      try {
        const fileExtension = getFileExtension(file)
        const fileName = `${randomUUID()}.${fileExtension}`
        const storagePath = `${user.id}/${fileName}`

        // Convert file to ArrayBuffer
        const arrayBuffer = await file.arrayBuffer()

        // Upload to Supabase Storage
        const { error: uploadError } = await serviceClient.storage
          .from('listing-images')
          .upload(storagePath, arrayBuffer, {
            contentType: file.type,
            upsert: false,
          })

        if (uploadError) {
          uploadErrors.push(`Failed to upload ${file.name}: ${uploadError.message}`)
          continue
        }

        imagePaths.push(storagePath)
      } catch (error) {
        uploadErrors.push(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // If any uploads failed, return error
    if (uploadErrors.length > 0 && imagePaths.length === 0) {
      return NextResponse.json(
        { error: 'Upload failed', details: uploadErrors },
        { status: 500 }
      )
    }

    // Generate signed URLs (valid for 1 hour)
    const signedUrls: string[] = []
    for (const path of imagePaths) {
      try {
        const { data, error } = await serviceClient.storage
          .from('listing-images')
          .createSignedUrl(path, 60 * 60) // 1 hour

        if (error || !data) {
          console.error(`Failed to create signed URL for ${path}:`, error)
          // Continue without signed URL
          signedUrls.push('')
        } else {
          signedUrls.push(data.signedUrl)
        }
      } catch (error) {
        console.error(`Error creating signed URL for ${path}:`, error)
        signedUrls.push('')
      }
    }

    // Return paths and signed URLs
    return NextResponse.json({
      image_paths: imagePaths,
      signed_urls: signedUrls,
      uploaded: imagePaths.length,
      errors: uploadErrors.length > 0 ? uploadErrors : undefined,
    })
  } catch (error) {
    console.error('Error in /api/upload:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
