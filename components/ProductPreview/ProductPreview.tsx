'use client'

import { useState, useEffect } from 'react'
import styles from './ProductPreview.module.css'

interface ProductPreviewProps {
  images: (File | string)[]
}

export default function ProductPreview({ images }: ProductPreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [objectUrls, setObjectUrls] = useState<string[]>([])

  // Convert Files to object URLs and handle cleanup
  useEffect(() => {
    const urls: string[] = []
    const createdUrls: string[] = []

    images.forEach((img) => {
      if (img instanceof File) {
        const url = URL.createObjectURL(img)
        urls.push(url)
        createdUrls.push(url)
      } else {
        urls.push(img)
      }
    })

    setObjectUrls(urls)

    // Cleanup function - revoke only URLs we created
    return () => {
      createdUrls.forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [images])

  if (objectUrls.length === 0) {
    return null
  }

  const activeUrl = objectUrls[activeIndex] || objectUrls[0]

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Your product preview</h3>
      <div className={styles.gallery}>
        {objectUrls.length > 1 && (
          <div className={styles.thumbnails}>
            {objectUrls.map((url, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`${styles.thumbnail} ${index === activeIndex ? styles.active : ''}`}
              >
                <img src={url} alt={`Thumbnail ${index + 1}`} />
              </button>
            ))}
          </div>
        )}
        <div className={styles.mainImage}>
          <img src={activeUrl} alt={`Product image ${activeIndex + 1}`} />
        </div>
      </div>
    </div>
  )
}
