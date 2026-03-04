'use client'

import { useState, useEffect, useMemo } from 'react'
import styles from './EtsyListingPreview.module.css'

interface EtsyListingPreviewProps {
  images: (File | string)[]
  title: string
  description: string
}

export default function EtsyListingPreview({ images, title, description }: EtsyListingPreviewProps) {
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

  // Extract highlights from description
  const highlights = useMemo(() => {
    const sentences = description
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 80)
      .slice(0, 3)
    
    if (sentences.length >= 3) {
      return sentences
    }
    
    // Fallback highlights
    const fallbacks = [
      'Soft, everyday comfort',
      'Unisex relaxed fit',
      'Easy to style & giftable'
    ]
    
    return [...sentences, ...fallbacks].slice(0, 3)
  }, [description])

  if (objectUrls.length === 0) {
    return null
  }

  const activeUrl = objectUrls[activeIndex] || objectUrls[0]

  return (
    <div className={styles.container}>
      <div className={styles.etsyPreview}>
        <div className={styles.gallerySection}>
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
        
        <div className={styles.purchasePanel}>
          <h1 className={styles.productTitle}>{title}</h1>
          
          <div className={styles.ratingRow}>
            <span className={styles.stars}>★★★★★</span>
            <span className={styles.reviewCount}>(XX)</span>
          </div>
          
          <div className={styles.price}>$XX.XX</div>
          
          <button type="button" className={styles.addToCartButton}>
            Add to cart
          </button>
          
          <div className={styles.highlights}>
            <h3 className={styles.highlightsTitle}>Highlights</h3>
            <ul className={styles.highlightsList}>
              {highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
