"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { GalleryLightbox, type GalleryLightboxPhoto } from "@/components/gallery/GalleryLightbox";

type AuctionGalleryProps = {
  images: string[];
  title: string;
};

function resolveGalleryImage(image: string): string {
  if (image.includes("picsum.photos")) {
    return "/vehicle-photo.svg";
  }

  return image;
}

export function AuctionGallery({ images, title }: AuctionGalleryProps) {
  const galleryImages = useMemo(
    () =>
      images
        .slice(0, 30)
        .map((image) => resolveGalleryImage(image)),
    [images],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  if (galleryImages.length === 0) {
    return (
      <section className="detail-gallery-panel">
        <p>No images available</p>
      </section>
    );
  }

  const activeImage = galleryImages[activeIndex] ?? galleryImages[0];
  const lightboxPhotos: GalleryLightboxPhoto[] = galleryImages.map((image, index) => ({
    id: `${image}-${index}`,
    label: `Photo ${index + 1}`,
    url: image,
    alt: `${title} image ${index + 1}`,
  }));

  return (
    <section className="detail-gallery-panel" aria-label="Vehicle gallery">
      <div className="detail-main-image-wrap">
        <button
          type="button"
          className="detail-gallery-expand"
          onClick={() => setIsExpanded(true)}
          aria-label="Expand gallery"
          aria-haspopup="dialog"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"
            />
          </svg>
          Expand
        </button>

        <Image
          src={activeImage}
          alt={`${title} image ${activeIndex + 1}`}
          width={1600}
          height={1000}
          className="detail-main-image"
          priority
        />
      </div>

      <div className="detail-thumb-grid">
        {galleryImages.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            className={`detail-thumb ${index === activeIndex ? "is-active" : ""}`}
            onClick={() => setActiveIndex(index)}
            aria-label={`Open image ${index + 1}`}
          >
            <Image
              src={image}
              alt={`${title} thumbnail ${index + 1}`}
              width={220}
              height={140}
              className="detail-thumb-image"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      <GalleryLightbox
        isOpen={isExpanded}
        title={title}
        photos={lightboxPhotos}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        onClose={() => setIsExpanded(false)}
      />
    </section>
  );
}
