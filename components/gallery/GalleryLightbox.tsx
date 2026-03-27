"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { IconCar } from "@/components/ui/icons";

import styles from "./GalleryLightbox.module.css";

export type GalleryLightboxPhoto = {
  id: string;
  label: string;
  url: string | null;
  bg?: string;
  alt?: string;
};

type GalleryLightboxProps = {
  isOpen: boolean;
  title: string;
  photos: GalleryLightboxPhoto[];
  activeIndex: number;
  failedPhotoIds?: string[];
  onSelect: (index: number) => void;
  onClose: () => void;
  onPhotoError?: (photo: GalleryLightboxPhoto) => void;
};

export function GalleryLightbox({
  isOpen,
  title,
  photos,
  activeIndex,
  failedPhotoIds = [],
  onSelect,
  onClose,
  onPhotoError,
}: GalleryLightboxProps) {
  useEffect(() => {
    if (!isOpen || photos.length === 0) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft" && activeIndex > 0) {
        event.preventDefault();
        onSelect(activeIndex - 1);
      }

      if (event.key === "ArrowRight" && activeIndex < photos.length - 1) {
        event.preventDefault();
        onSelect(activeIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeIndex, isOpen, onClose, onSelect, photos.length]);

  if (typeof document === "undefined" || !isOpen || photos.length === 0) {
    return null;
  }

  const safeIndex = Math.min(Math.max(activeIndex, 0), photos.length - 1);
  const activePhoto = photos[safeIndex] ?? photos[0];

  if (!activePhoto) {
    return null;
  }

  const isBroken = failedPhotoIds.includes(activePhoto.id);

  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} image gallery`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>
            <div className={styles.toolbarTitle}>{title}</div>
            <div className={styles.toolbarCount}>
              {safeIndex + 1} / {photos.length}
            </div>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close expanded gallery">
            Close
          </button>
        </div>

        <div className={styles.stage}>
          {safeIndex > 0 ? (
            <button
              type="button"
              className={styles.navButton}
              onClick={() => onSelect(safeIndex - 1)}
              aria-label="Previous photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : (
            <div className={styles.navSpacer} aria-hidden />
          )}

          <div className={styles.stageMedia}>
            {activePhoto.url && !isBroken ? (
              <img
                src={activePhoto.url}
                alt={activePhoto.alt ?? `${title} - ${activePhoto.label}`}
                className={styles.stageImage}
                onError={() => {
                  onPhotoError?.(activePhoto);
                }}
              />
            ) : (
              <div
                className={styles.placeholder}
                style={{ background: activePhoto.bg ?? "linear-gradient(135deg,#e8edf2 0%,#cfd8e3 100%)" }}
              >
                <IconCar size={88} strokeWidth={1.1} className={styles.placeholderIcon} />
                <div className={styles.placeholderLabel}>{activePhoto.label}</div>
              </div>
            )}
          </div>

          {safeIndex < photos.length - 1 ? (
            <button
              type="button"
              className={styles.navButton}
              onClick={() => onSelect(safeIndex + 1)}
              aria-label="Next photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <div className={styles.navSpacer} aria-hidden />
          )}
        </div>

        <div>
          <p className={styles.caption}>{activePhoto.label}</p>

          {photos.length > 1 ? (
            <div className={styles.thumbnailRow}>
              {photos.map((photo, index) => {
                const photoBroken = failedPhotoIds.includes(photo.id);

                return (
                  <button
                    key={photo.id}
                    type="button"
                    className={`${styles.thumbnailButton} ${index === safeIndex ? styles.thumbnailActive : ""}`.trim()}
                    onClick={() => onSelect(index)}
                    aria-label={`View ${photo.label}`}
                    style={!photo.url || photoBroken ? { background: photo.bg } : undefined}
                  >
                    {photo.url && !photoBroken ? (
                      <img
                        src={photo.url}
                        alt={photo.alt ?? `${title} - ${photo.label}`}
                        className={styles.thumbnailImage}
                        onError={() => {
                          onPhotoError?.(photo);
                        }}
                      />
                    ) : (
                      <span className={styles.thumbnailPlaceholder}>{photo.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
