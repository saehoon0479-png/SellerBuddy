'use client'

import { useState, useRef } from 'react'
import { Plan } from '@/types'
import { getMaxImages } from '@/lib/utils/plan-limits'
import styles from './ImageUploader.module.css'

interface ImageUploaderProps {
  plan: Plan
  onImagesChange: (urls: string[]) => void
  initialImages?: string[]
}

export default function ImageUploader({
  plan,
  onImagesChange,
  initialImages = [],
}: ImageUploaderProps) {
  const [images, setImages] = useState<string[]>(initialImages)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const maxImages = getMaxImages(plan)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const totalFiles = images.length + files.length
    if (totalFiles > maxImages) {
      setError(`최대 ${maxImages}장의 이미지만 업로드할 수 있습니다.`)
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    Array.from(files).forEach((file) => {
      formData.append('files', file)
    })

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '업로드 실패')
      }

      const newImages = [...images, ...data.urls]
      setImages(newImages)
      onImagesChange(newImages)
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    setImages(newImages)
    onImagesChange(newImages)
  }

  return (
    <div className={styles.container}>
      <label className={styles.label}>
        이미지 업로드 ({images.length}/{maxImages})
      </label>
      <div
        className={styles.dropZone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple={maxImages > 1}
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: 'none' }}
          disabled={uploading || images.length >= maxImages}
        />
        {uploading ? (
          <div className={styles.uploading}>업로드 중...</div>
        ) : images.length >= maxImages ? (
          <div className={styles.full}>최대 이미지 수에 도달했습니다.</div>
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.icon}>📷</div>
            <div>이미지를 드래그하거나 클릭하여 업로드</div>
            <div className={styles.hint}>최대 {maxImages}장</div>
          </div>
        )}
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {images.length > 0 && (
        <div className={styles.previewGrid}>
          {images.map((url, index) => (
            <div key={index} className={styles.previewItem}>
              <img src={url} alt={`Preview ${index + 1}`} />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className={styles.removeButton}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
