"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";
import { IconArrowRight, IconEye } from "@/components/ui/icons";
import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./LotGallery.module.css";

type Props = {
  images: string[];
  title: string;
  locale: SupportedLocale;
};

export function LotGallery({ images, title, locale }: Props) {
  const isRu = locale === "ru";
  const galleryImages = images.length > 0 ? images : ["/vehicle-photo.svg"];
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const safeIndex = Math.min(Math.max(activeIndex, 0), galleryImages.length - 1);
  const photos = useMemo(
    () =>
      galleryImages.map((url, index) => ({
        id: `${url}-${index}`,
        label: `${isRu ? "Фото" : "Photo"} ${index + 1}`,
        url,
        alt: `${title} - ${isRu ? "фото" : "photo"} ${index + 1}`,
      })),
    [galleryImages, isRu, title],
  );

  return (
    <section className={styles.section} aria-label={isRu ? "Галерея автомобиля" : "Vehicle gallery"}>
      <div className={styles.stage} onClick={() => setIsLightboxOpen(true)} role="button" tabIndex={0}>
        <Image
          src={galleryImages[safeIndex]}
          alt={`${title} - ${isRu ? "фото" : "photo"} ${safeIndex + 1}`}
          fill
          priority={safeIndex === 0}
          sizes="(max-width: 980px) 100vw, 860px"
          className={styles.stageImage}
        />

        <div className={styles.photoBadge}>{`${galleryImages.length} ${isRu ? "фото" : "photos"}`}</div>

        <button
          type="button"
          className={styles.hdButton}
          onClick={(event) => {
            event.stopPropagation();
            setIsLightboxOpen(true);
          }}
        >
          <IconEye size={14} strokeWidth={1.9} />
          <span>HD View</span>
        </button>

        <div className={styles.counter}>{`${safeIndex + 1} / ${galleryImages.length}`}</div>

        {galleryImages.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.arrowButton} ${styles.arrowLeft}`}
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex((current) => (current === 0 ? galleryImages.length - 1 : current - 1));
              }}
              aria-label={isRu ? "Предыдущее фото" : "Previous photo"}
            >
              <IconArrowRight size={18} className={styles.arrowLeftIcon} />
            </button>

            <button
              type="button"
              className={`${styles.arrowButton} ${styles.arrowRight}`}
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex((current) => (current === galleryImages.length - 1 ? 0 : current + 1));
              }}
              aria-label={isRu ? "Следующее фото" : "Next photo"}
            >
              <IconArrowRight size={18} />
            </button>
          </>
        ) : null}
      </div>

      {galleryImages.length > 1 ? (
        <div className={styles.thumbnailRow} role="list" aria-label={isRu ? "Миниатюры" : "Thumbnails"}>
          {galleryImages.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              className={`${styles.thumbnailButton} ${index === safeIndex ? styles.thumbnailButtonActive : ""}`}
              onClick={() => setActiveIndex(index)}
              aria-current={index === safeIndex ? "true" : undefined}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="68px"
                className={styles.thumbnailImage}
              />
            </button>
          ))}
        </div>
      ) : null}

      <GalleryLightbox
        isOpen={isLightboxOpen}
        title={title}
        photos={photos}
        activeIndex={safeIndex}
        onSelect={setActiveIndex}
        onClose={() => setIsLightboxOpen(false)}
      />
    </section>
  );
}
