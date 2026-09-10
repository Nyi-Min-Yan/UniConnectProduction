'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Loader2, ChevronLeft, ChevronRight, Check, Image as ImageIcon } from 'lucide-react';

interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  postId?: string;
  authorName?: string;
  images?: string[];
}

function dataUrlExt(src: string): string {
  const mime = (src.match(/^data:([^;]+);/) ?? [])[1] ?? 'image/png';
  const ext = mime.split('/')[1] ?? 'png';
  return ext.includes('svg') ? 'svg' : ext.split('+')[0] ?? 'png';
}

async function downloadSingleImage(src: string, filename: string) {
  const blob = await fetch(src).then((r) => r.blob());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadAllImages(urls: string[], baseName: string) {
  for (let i = 0; i < urls.length; i++) {
    const ext = dataUrlExt(urls[i]);
    const name = urls.length === 1
      ? `${baseName}.${ext}`
      : `${baseName}_${i + 1}.${ext}`;
    await downloadSingleImage(urls[i], name);
    if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
}

export default function ImageLightbox({ open, onClose, src, postId, authorName, images }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const allImages = useMemo(() => images && images.length > 0 ? images : [src], [images, src]);
  const hasMultiple = allImages.length > 1;

  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = allImages.indexOf(src);
    return idx >= 0 ? idx : 0;
  });
  const [downloading, setDownloading] = useState(false);
  const [showDownloadPicker, setShowDownloadPicker] = useState(false);
  const [selectedForDownload, setSelectedForDownload] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      const idx = allImages.indexOf(src);
      requestAnimationFrame(() => {
        setCurrentIndex(idx >= 0 ? idx : 0);
        setShowDownloadPicker(false);
        setSelectedForDownload(new Set());
      });
    }
  }, [open, allImages, src]);

  const lastSrcRef = useRef(src);
  useEffect(() => {
    if (lastSrcRef.current === src) return;
    lastSrcRef.current = src;
    const idx = allImages.indexOf(src);
    if (idx >= 0) {
      requestAnimationFrame(() => setCurrentIndex(idx));
    }
  }, [src, allImages]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!open && el.open) {
      el.close();
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => { document.body.style.overflow = ''; onClose(); };
    el.addEventListener('close', handler);
    return () => el.removeEventListener('close', handler);
  }, [onClose]);

  const go = useCallback((dir: number) => {
    setCurrentIndex((i) => (i + dir + allImages.length) % allImages.length);
  }, [allImages.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  const currentSrc = allImages[currentIndex] ?? src;
  const baseName = `uniconnect-${postId ?? 'image'}`;

  const handleDownloadCurrent = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadSingleImage(currentSrc, `${baseName}.${dataUrlExt(currentSrc)}`);
    } finally {
      setTimeout(() => setDownloading(false), 600);
    }
  };

  const handleDownloadAll = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadAllImages(allImages, baseName);
    } finally {
      setDownloading(false);
      setShowDownloadPicker(false);
    }
  };

  const handleDownloadSelected = async () => {
    if (downloading || selectedForDownload.size === 0) return;
    setDownloading(true);
    try {
      const urls = [...selectedForDownload].map((i) => allImages[i]).filter(Boolean);
      await downloadAllImages(urls, baseName);
    } finally {
      setDownloading(false);
      setShowDownloadPicker(false);
      setSelectedForDownload(new Set());
    }
  };

  const toggleSelect = (idx: number) => {
    setSelectedForDownload((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="image-lightbox"
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        margin: 'auto',
        width: 'min(94vw, 1100px)',
        maxHeight: '92vh',
        overflow: 'hidden',
      }}
    >
      <style>{`
        dialog.image-lightbox::backdrop {
          background: rgba(4, 10, 16, 0.82);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
      `}</style>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="flex flex-col items-center gap-3"
        style={{ overflow: 'hidden' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="w-full flex items-center justify-between px-4 py-2.5"
          style={{
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            background: 'rgba(11, 18, 32, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderBottom: 'none',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {authorName && (
              <>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', fontSize: 11 }}
                >
                  {authorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className="truncate" style={{ color: '#e8f0f6', fontWeight: 600, fontSize: 13.5 }}>{authorName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {hasMultiple && (
              <span style={{ color: 'rgba(232,240,246,0.5)', fontSize: 12, fontWeight: 500 }}>
                {currentIndex + 1} / {allImages.length}
              </span>
            )}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasMultiple) setShowDownloadPicker((p) => !p);
                  else void handleDownloadCurrent();
                }}
                disabled={downloading}
                className="flex items-center gap-1.5 border-none cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60"
                style={{
                  background: hasMultiple ? 'rgba(255,255,255,0.1)' : 'var(--primary)',
                  color: hasMultiple ? '#e8f0f6' : '#ffffff',
                  fontWeight: 600,
                  fontSize: 12.5,
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  minHeight: 34,
                }}
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {downloading ? 'Preparing...' : hasMultiple ? 'Download' : 'Download image'}
              </button>

              <AnimatePresence>
                {showDownloadPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className="absolute top-full mt-1 right-0 p-3"
                    style={{
                      background: 'rgba(11, 18, 32, 0.95)',
                      backdropFilter: 'blur(12px)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                      minWidth: 220,
                      zIndex: 20,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ color: '#e8f0f6', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                      Download photos
                    </div>
                    <div className="flex flex-col gap-1.5 mb-3" style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {allImages.map((url, i) => (
                        <label
                          key={i}
                          onClick={(e) => { e.preventDefault(); toggleSelect(i); }}
                          className="flex items-center gap-2 cursor-pointer px-2 py-1.5 transition-colors"
                          style={{ borderRadius: 'var(--radius-sm)', background: selectedForDownload.has(i) ? 'rgba(40, 114, 161, 0.2)' : 'transparent' }}
                          onMouseEnter={(e) => { if (!selectedForDownload.has(i)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                          onMouseLeave={(e) => { if (!selectedForDownload.has(i)) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div
                            className="flex items-center justify-center shrink-0"
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              border: `1.5px solid ${selectedForDownload.has(i) ? 'var(--primary)' : 'rgba(255,255,255,0.3)'}`,
                              background: selectedForDownload.has(i) ? 'var(--primary)' : 'transparent',
                              color: '#fff',
                            }}
                          >
                            {selectedForDownload.has(i) && <Check size={12} />}
                          </div>
                          <img src={url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                          <span style={{ color: 'rgba(232,240,246,0.8)', fontSize: 12, fontWeight: 500 }}>
                            Photo {i + 1}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadAll}
                        disabled={downloading}
                        className="flex-1 btn btn-xs border-none text-white cursor-pointer gap-1"
                        style={{ background: 'var(--primary)', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: 11 }}
                      >
                        {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        All ({allImages.length})
                      </button>
                      <button
                        onClick={handleDownloadSelected}
                        disabled={downloading || selectedForDownload.size === 0}
                        className="flex-1 btn btn-xs border-none cursor-pointer gap-1 disabled:opacity-40"
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#e8f0f6', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: 11, border: '1px solid rgba(255,255,255,0.15)' }}
                      >
                        {downloading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                        Selected ({selectedForDownload.size})
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <div
          className="relative w-full"
          style={{
            borderRadius: hasMultiple ? '0' : 'var(--radius-lg)',
            overflow: 'hidden',
            background: '#0b1220',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={currentIndex}
              src={currentSrc}
              alt=""
              className="w-full h-auto block"
              style={{ maxHeight: 'calc(92vh - 140px)', objectFit: 'contain', margin: '0 auto' }}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
            />
          </AnimatePresence>

          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Close"
            className="cursor-pointer border-none flex items-center justify-center transition-all duration-200 hover:scale-110 hover:rotate-90"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(8, 15, 23, 0.7)',
              color: '#e8f0f6',
              border: '1px solid rgba(255,255,255,0.18)',
              zIndex: 10,
            }}
          >
            <X size={17} />
          </button>

          {hasMultiple && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label="Previous"
                className="cursor-pointer border-none flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'rgba(8, 15, 23, 0.7)',
                  color: '#e8f0f6',
                  border: '1px solid rgba(255,255,255,0.18)',
                  zIndex: 10,
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label="Next"
                className="cursor-pointer border-none flex items-center justify-center transition-all duration-200 hover:scale-110"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'rgba(8, 15, 23, 0.7)',
                  color: '#e8f0f6',
                  border: '1px solid rgba(255,255,255,0.18)',
                  zIndex: 10,
                }}
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>

        {hasMultiple && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.2 }}
            className="flex items-center gap-2 flex-wrap justify-center"
          >
            {allImages.map((url, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
                className="cursor-pointer border-none transition-all duration-200"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  border: i === currentIndex ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,0.15)',
                  opacity: i === currentIndex ? 1 : 0.55,
                  padding: 0,
                  background: 'transparent',
                }}
              >
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </motion.div>
        )}
      </motion.div>
    </dialog>,
    document.body
  );
}
