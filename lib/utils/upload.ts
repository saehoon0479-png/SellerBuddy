export function getFileExtension(file: File): string {
  // Try to get extension from MIME type first
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }

  if (file.type && mimeToExt[file.type]) {
    return mimeToExt[file.type]
  }

  // Fallback to filename extension
  const filename = file.name
  const lastDot = filename.lastIndexOf('.')
  if (lastDot !== -1 && lastDot < filename.length - 1) {
    return filename.substring(lastDot + 1).toLowerCase()
  }

  // Default to jpg if we can't determine
  return 'jpg'
}

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check MIME type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' }
  }

  // Check file size (8MB = 8 * 1024 * 1024 bytes)
  const maxSize = 8 * 1024 * 1024
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 8MB limit' }
  }

  return { valid: true }
}
