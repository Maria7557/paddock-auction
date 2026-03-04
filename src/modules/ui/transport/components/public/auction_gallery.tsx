"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

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

  if (galleryImages.length === 0) {
    return (
      <section className="detail-gallery-panel">
        <p>No images available</p>
      </section>
    );
  }

  const activeImage = galleryImages[activeIndex] ?? galleryImages[0];

  return (
    <section className="detail-gallery-panel" aria-label="Vehicle gallery">
      <div className="detail-main-image-wrap">
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
    </section>
  );
}
