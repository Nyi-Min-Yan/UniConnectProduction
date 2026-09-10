'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MediaCarouselProps {
  urls: string[];
  alt?: string;
  maxHeight?: number;
  height?: number;
  onOpenImage?: (url: string) => void;
}

export default function MediaCarousel({ urls, alt = '', maxHeight = 480, height, onOpenImage }: MediaCarouselProps) {
  const [index, setIndex] = useState(0);
  const total = urls.length;
  if (total === 0) return null;
  const at = index >= total ? 0 : index;
  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--surface-border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
        background: 'rgba(0,0,0,0.03)',
        height,
      }}
    >
      <img
        src={urls[at]}
        alt={alt}
        loading="lazy"
        className="w-full block"
        style={height
          ? { height: '100%', objectFit: 'contain', cursor: onOpenImage ? 'zoom-in' : 'default' }
          : { maxHeight, objectFit: 'contain', cursor: onOpenImage ? 'zoom-in' : 'default' }}
        onClick={() => onOpenImage?.(urls[at])}
      />
      {total > 1 && (
        <>
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              background: 'rgba(0,0,0,0.55)',
              borderRadius: 20,
              padding: '3px 10px',
              letterSpacing: '0.3px',
              userSelect: 'none',
            }}
          >
            {at + 1}/{total}
          </span>
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer border-none transition-colors hover:bg-black/70"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', color: '#fff', zIndex: 2 }}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer border-none transition-colors hover:bg-black/70"
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', color: '#fff', zIndex: 2 }}
          >
            <ChevronRight size={17} />
          </button>
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5"
            style={{ zIndex: 2 }}
          >
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to image ${i + 1}`}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className="cursor-pointer border-none"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  padding: 0,
                  background: i === at ? '#fff' : 'rgba(255,255,255,0.5)',
                  transition: 'background 0.15s',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}