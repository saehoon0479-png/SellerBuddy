import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getMaxImages } from '@/lib/utils/plan-limits'

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user plan
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const maxImages = getMaxImages(userData.plan)
    if (files.length > maxImages) {
      return NextResponse.json(
        { error: `Maximum ${maxImages} image(s) allowed for ${userData.plan} plan` },
        { status: 400 }
      )
    }

    const uploadedUrls: string[] = []

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const fileBuffer = await file.arrayBuffer()

      const { data, error } = await supabase.storage
        .from('listings')
        .upload(fileName, fileBuffer, {
          contentType: file.type,
          upsert: false,
        })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('listings').getPublicUrl(data.path)

      uploadedUrls.push(publicUrl)
    }

    return NextResponse.json({ urls: uploadedUrls })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
