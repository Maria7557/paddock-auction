"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { IconArrowRight, IconEye, IconX } from "@/components/ui/icons";
import type { SupportedLocale } from "@/src/i18n/routing";

import styles from "./LotGallery.module.css";

type Props = {
  images: string[];
  title: string;
  locale: SupportedLocale;
};

type DragOffset = {
  x: number;
  y: number;
};

type DragState = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const MIN_ZOOM_LEVEL = 1;
const MAX_ZOOM_LEVEL = 4;
const ZOOM_STEP = 0.5;

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return length - 1;
  }

  if (index >= length) {
    return 0;
  }

  return index;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function LotGallery({ images, title, locale }: Props) {
  const isRu = locale === "ru";
  const galleryImages = images.length > 0 ? images : ["/vehicle-photo.svg"];
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM_LEVEL);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const lightboxFrameRef = useRef<HTMLDivElement | null>(null);
  const safeIndex = clampIndex(activeIndex, galleryImages.length);
  const safeLightboxIndex = clampIndex(lightboxIndex, galleryImages.length);

  const clampDragOffset = useCallback(
    (nextOffset: DragOffset, nextZoom = zoomLevel): DragOffset => {
      const frameElement = lightboxFrameRef.current;

      if (!frameElement || nextZoom <= MIN_ZOOM_LEVEL) {
        return { x: 0, y: 0 };
      }

      const frameBounds = frameElement.getBoundingClientRect();
      const maxOffsetX = ((nextZoom - 1) * frameBounds.width) / (2 * nextZoom);
      const maxOffsetY = ((nextZoom - 1) * frameBounds.height) / (2 * nextZoom);

      return {
        x: clampValue(nextOffset.x, -maxOffsetX, maxOffsetX),
        y: clampValue(nextOffset.y, -maxOffsetY, maxOffsetY),
      };
    },
    [zoomLevel],
  );

  const resetLightboxView = useCallback(() => {
    dragStateRef.current = null;
    setZoomLevel(MIN_ZOOM_LEVEL);
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  const syncGalleryIndex = useCallback(
    (nextIndex: number) => {
      const normalizedIndex = clampIndex(nextIndex, galleryImages.length);
      setActiveIndex(normalizedIndex);
      setLightboxIndex(normalizedIndex);
    },
    [galleryImages.length],
  );

  const openLightbox = useCallback(
    (index: number) => {
      syncGalleryIndex(index);
      resetLightboxView();
      setLightboxOpen(true);
    },
    [resetLightboxView, syncGalleryIndex],
  );

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    resetLightboxView();
  }, [resetLightboxView]);

  const navigateLightbox = useCallback(
    (direction: -1 | 1) => {
      syncGalleryIndex(safeLightboxIndex + direction);
      resetLightboxView();
    },
    [resetLightboxView, safeLightboxIndex, syncGalleryIndex],
  );

  const setClampedZoom = useCallback(
    (nextZoom: number) => {
      const normalizedZoom = clampValue(Number(nextZoom.toFixed(2)), MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
      setZoomLevel(normalizedZoom);
      setDragOffset((currentOffset) => clampDragOffset(currentOffset, normalizedZoom));

      if (normalizedZoom <= MIN_ZOOM_LEVEL) {
        dragStateRef.current = null;
        setDragOffset({ x: 0, y: 0 });
        setIsDragging(false);
      }
    },
    [clampDragOffset],
  );

  useEffect(() => {
    if (!lightboxOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
      }

      if (event.key === "ArrowLeft" && galleryImages.length > 1) {
        navigateLightbox(-1);
      }

      if (event.key === "ArrowRight" && galleryImages.length > 1) {
        navigateLightbox(1);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [closeLightbox, galleryImages.length, lightboxOpen, navigateLightbox]);

  useEffect(() => {
    const element = document.getElementById(`lb-thumb-${lightboxIndex}`);

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [lightboxIndex]);

  const handleStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(safeIndex);
    }
  };

  const handleLightboxMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (zoomLevel <= MIN_ZOOM_LEVEL) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
    setIsDragging(true);
  };

  const handleLightboxMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStateRef.current) {
      return;
    }

    const nextOffset = {
      x: dragStateRef.current.originX + (event.clientX - dragStateRef.current.startX) / zoomLevel,
      y: dragStateRef.current.originY + (event.clientY - dragStateRef.current.startY) / zoomLevel,
    };

    setDragOffset(clampDragOffset(nextOffset));
  };

  const handleLightboxMouseUp = () => {
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const lightboxImageTransform = `scale(${zoomLevel}) translateX(${dragOffset.x}px) translateY(${dragOffset.y}px)`;
  const lightboxTitle = title;

  return (
    <section className={styles.section} aria-label={isRu ? "Галерея автомобиля" : "Vehicle gallery"}>
      <div
        className={styles.stage}
        onClick={() => openLightbox(safeIndex)}
        onKeyDown={handleStageKeyDown}
        role="button"
        tabIndex={0}
      >
        <Image
          src={galleryImages[safeIndex]}
          alt={`${title} - ${isRu ? "фото" : "photo"} ${safeIndex + 1}`}
          fill
          priority={safeIndex === 0}
          sizes="(max-width: 980px) 100vw, 860px"
          className={styles.stageImage}
          onClick={() => {
            setActiveIndex(safeIndex);
            setLightboxIndex(safeIndex);
            resetLightboxView();
            setLightboxOpen(true);
          }}
        />

        <div className={styles.photoBadge}>{`${galleryImages.length} ${isRu ? "фото" : "photos"}`}</div>

        <button
          type="button"
          className={styles.hdButton}
          onClick={(event) => {
            event.stopPropagation();
            openLightbox(safeIndex);
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
                syncGalleryIndex(safeIndex - 1);
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
                syncGalleryIndex(safeIndex + 1);
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
              onClick={() => syncGalleryIndex(index)}
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

      {lightboxOpen ? (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={isRu ? "HD просмотр" : "HD view"}>
          <div className={styles.lightboxBar}>
            <div className={styles.lightboxTitle}>{lightboxTitle}</div>
            <div className={styles.lightboxBarCounter}>
              {`${isRu ? "Фото" : "Photo"} ${safeLightboxIndex + 1} / ${galleryImages.length}`}
            </div>
            <button
              type="button"
              className={styles.lightboxCloseButton}
              onClick={closeLightbox}
              aria-label={isRu ? "Закрыть галерею" : "Close gallery"}
            >
              <IconX size={18} strokeWidth={2.1} />
            </button>
          </div>

          <div className={styles.lightboxMain}>
            {galleryImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className={`${styles.lightboxArrowButton} ${styles.lightboxArrowLeft}`}
                  onClick={() => navigateLightbox(-1)}
                  aria-label={isRu ? "Предыдущее фото" : "Previous photo"}
                >
                  <span aria-hidden="true">‹</span>
                </button>

                <button
                  type="button"
                  className={`${styles.lightboxArrowButton} ${styles.lightboxArrowRight}`}
                  onClick={() => navigateLightbox(1)}
                  aria-label={isRu ? "Следующее фото" : "Next photo"}
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            ) : null}

            <div className={styles.lightboxZoomControls}>
              <button
                type="button"
                className={styles.lightboxZoomButton}
                onClick={() => setClampedZoom(zoomLevel - ZOOM_STEP)}
                disabled={zoomLevel <= MIN_ZOOM_LEVEL}
                aria-label={isRu ? "Уменьшить" : "Zoom out"}
              >
                -
              </button>
              <button
                type="button"
                className={`${styles.lightboxZoomButton} ${styles.lightboxZoomReadout}`}
                onClick={resetLightboxView}
                aria-label={isRu ? "Сбросить масштаб" : "Reset zoom"}
              >
                {`${Math.round(zoomLevel * 100)}%`}
              </button>
              <button
                type="button"
                className={styles.lightboxZoomButton}
                onClick={() => setClampedZoom(zoomLevel + ZOOM_STEP)}
                disabled={zoomLevel >= MAX_ZOOM_LEVEL}
                aria-label={isRu ? "Увеличить" : "Zoom in"}
              >
                +
              </button>
            </div>

            <div
              ref={lightboxFrameRef}
              className={`${styles.lightboxFrame} ${zoomLevel > MIN_ZOOM_LEVEL ? styles.lightboxFrameZoomed : ""} ${isDragging ? styles.lightboxFrameDragging : ""}`}
              onMouseDown={handleLightboxMouseDown}
              onMouseMove={handleLightboxMouseMove}
              onMouseUp={handleLightboxMouseUp}
              onMouseLeave={handleLightboxMouseUp}
            >
              <div className={styles.lightboxImageShell}>
                <Image
                  src={galleryImages[safeLightboxIndex]}
                  alt={`${title} - ${isRu ? "фото" : "photo"} ${safeLightboxIndex + 1}`}
                  fill
                  priority
                  sizes="100vw"
                  className={`${styles.lightboxImage} ${!isDragging ? styles.lightboxImageAnimated : ""}`}
                  style={{ transform: lightboxImageTransform }}
                  draggable={false}
                />
              </div>
            </div>
          </div>

          {galleryImages.length > 1 ? (
            <div className={styles.lightboxThumbs} role="list" aria-label={isRu ? "Фото в HD-галерее" : "HD gallery thumbnails"}>
              {galleryImages.map((src, index) => (
                <button
                  key={`lightbox-thumb-${src}-${index}`}
                  id={`lb-thumb-${index}`}
                  type="button"
                  className={`${styles.lightboxThumbButton} ${index === safeLightboxIndex ? styles.lightboxThumbButtonActive : ""}`}
                  onClick={() => {
                    syncGalleryIndex(index);
                    resetLightboxView();
                  }}
                  aria-current={index === safeLightboxIndex ? "true" : undefined}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="96px"
                    className={styles.lightboxThumbImage}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
