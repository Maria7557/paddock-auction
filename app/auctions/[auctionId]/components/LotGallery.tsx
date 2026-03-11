'use client';
// app/lot/[id]/components/LotGallery.tsx

import Image from 'next/image';
import { useState, useCallback } from 'react';
import styles from './LotGallery.module.css';

type Props = {
  images: string[];
  title:  string;
};

export function LotGallery({ images, title }: Props) {
  const imgs = images.length > 0 ? images : ['/images/car-elantra.jpg'];
  const [active, setActive] = useState(0);

  const prev = useCallback(() => setActive((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setActive((i) => Math.min(imgs.length - 1, i + 1)), [imgs.length]);

  // keyboard nav on main image
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  };

  return (
    <div className={styles.gallery} role="region" aria-label="Vehicle image gallery">
      {/* ── Main image ── */}
      <div
        className={styles.main}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`Image ${active + 1} of ${imgs.length}: ${title}`}
      >
        <Image
          key={imgs[active]}
          src={imgs[active]}
          alt={`${title} — photo ${active + 1}`}
          fill
          sizes="(max-width: 1080px) 100vw, 65vw"
          style={{ objectFit: 'cover' }}
          priority={active === 0}
        />

        {/* Count badge */}
        <div className={styles.count} aria-hidden>
          {active + 1}&thinsp;/&thinsp;{imgs.length}
        </div>

        {/* Nav arrows */}
        {active > 0 && (
          <button
            className={`${styles.arrow} ${styles.arrowPrev}`}
            onClick={prev}
            aria-label="Previous image"
          >
            ‹
          </button>
        )}
        {active < imgs.length - 1 && (
          <button
            className={`${styles.arrow} ${styles.arrowNext}`}
            onClick={next}
            aria-label="Next image"
          >
            ›
          </button>
        )}

        {/* Expand hint */}
        <div className={styles.expandHint} aria-hidden>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
          </svg>
          {imgs.length} photos
        </div>
      </div>

      {/* ── Thumbnails ── */}
      {imgs.length > 1 && (
        <div
          className={styles.thumbs}
          role="list"
          aria-label="Image thumbnails"
        >
          {imgs.map((src, i) => (
            <button
              key={src + i}
              role="listitem"
              className={`${styles.thumb} ${i === active ? styles.thumbActive : ''}`}
              onClick={() => setActive(i)}
              aria-label={`View photo ${i + 1}`}
              aria-current={i === active ? 'true' : undefined}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="88px"
                style={{ objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
