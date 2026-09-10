'use client';

import { useState, useRef, useCallback } from 'react';
import { Image as ImageIcon, Video, Send, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from './session';
import { playEntranceSong, stopEntranceSong } from '@/lib/entrance';

const TAG_OPTIONS = [
  { label: 'General', color: 'badge-ghost', emoji: '💬' },
  { label: 'Lost & Found', color: 'badge-warning', emoji: '🔍' },
  { label: 'Announcement', color: 'badge-info', emoji: '📢' },
];

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGES = 6;

function ScanOverlay({ label }: { label: string }) {
  const corners = [
    { top: 0, left: 0, bTop: true, bLeft: true, bBottom: false, bRight: false },
    { top: 0, right: 0, bTop: true, bRight: true, bBottom: false, bLeft: false },
    { bottom: 0, left: 0, bBottom: true, bLeft: true, bTop: false, bRight: false },
    { bottom: 0, right: 0, bBottom: true, bRight: true, bTop: false, bLeft: false },
  ];
  const bracket: React.CSSProperties = { position: 'absolute', width: 12, height: 12, borderColor: 'rgba(34, 255, 136, 0.85)', borderStyle: 'solid', borderWidth: 0 };
  return (
    <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
      <div className="scan-grid absolute inset-0 opacity-40" />
      <div className="scan-sweep-line" style={{ background: 'linear-gradient(to bottom, transparent, rgba(34, 255, 136, 0.5), transparent)' }} />
      <div
        className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-sm"
        style={{ background: 'rgba(0, 20, 10, 0.8)', border: '1px solid rgba(34, 255, 136, 0.45)', color: '#22ff88', fontSize: 10, fontWeight: 700, letterSpacing: 1, zIndex: 2 }}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#22ff88', animation: 'scan-blink 0.9s ease-in-out infinite' }} />
        SCANNING {label}
      </div>
      {corners.map((c, i) => (
        <span
          key={i}
          style={{
            ...bracket,
            top: c.top,
            left: c.left,
            right: c.right,
            bottom: c.bottom,
            borderTopWidth: c.bTop ? 1.5 : 0,
            borderLeftWidth: c.bLeft ? 1.5 : 0,
            borderBottomWidth: c.bBottom ? 1.5 : 0,
            borderRightWidth: c.bRight ? 1.5 : 0,
          }}
        />
      ))}
    </div>
  );
}

// Extract a single JPEG frame (~30% into the video, max 640px wide) so the
// AI video models can analyse the visual content. The frame is sent only to
// the moderation endpoint and is never stored.
function extractVideoFrame(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;
      video.onloadedmetadata = () => {
        if (!video.duration || !isFinite(video.duration)) return;
        video.currentTime = Math.min(Math.max(video.duration * 0.3, 0), Math.max(video.duration - 0.2, 0));
      };
      video.onseeked = () => {
        try {
          const maxW = 640;
          const scale = Math.min(1, maxW / Math.max(video.videoWidth, 1));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

interface FeedComposerProps {
  avatarInitials?: string;
}

export default function FeedComposer({ avatarInitials }: FeedComposerProps) {
  const { user: session } = useSession();
  const canPostOfficialTags = session?.role === 'admin' || session?.role === 'student-affair';
  const visibleTags = canPostOfficialTags
    ? TAG_OPTIONS
    : TAG_OPTIONS.filter((t) => t.label !== 'Announcement');
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    if (videoFile) {
      toast.error('Remove the video before adding photos');
      return;
    }
    const room = Math.max(MAX_IMAGES - images.length, 0);
    const picked = files.slice(0, room);
    if (picked.length < files.length) {
      toast.error(`You can attach up to ${MAX_IMAGES} photos`);
    }
    picked.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        setImages((prev) => {
          if (prev.includes(src) || prev.length >= MAX_IMAGES) return prev;
          return [...prev, src];
        });
      };
      reader.readAsDataURL(f);
    });
  }, [videoFile, images.length]);

  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Please choose a video file');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error('Video must be 100MB or smaller');
      return;
    }
    if (images.length > 0) {
      toast.error('Remove the photos before adding a video');
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  }, [images.length]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeVideo = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoFile(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  }, [videoUrl]);

  const toggleTag = useCallback((tag: string) => {
    if (!canPostOfficialTags && tag === 'Announcement') return;
    setSelectedTag((prev) => (prev === tag ? null : tag));
  }, [canPostOfficialTags]);

  const handlePost = useCallback(async () => {
    if ((!text.trim() && images.length === 0 && !videoFile) || submitting) return;
    if (!session) {
      toast.error('Please sign in to post');
      return;
    }
    setSubmitting(true);
    playEntranceSong({ loop: true });
    try {
      let mediaVideoUrl: string | null = null;
      let videoFrame: string | null = null;
      if (videoFile) {
        const formData = new FormData();
        formData.append('file', videoFile);
        formData.append('category', 'posts');
        const res = await fetch('/api/files', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not upload video');
        mediaVideoUrl = data.url;
        videoFrame = await extractVideoFrame(videoFile);
      }
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          images: images.length > 0 ? images : undefined,
          videoUrl: mediaVideoUrl,
          videoFrame,
          tags: selectedTag ? TAG_OPTIONS.filter((t) => t.label === selectedTag) : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit post');
      }
      setText('');
      setImages([]);
      removeVideo();
      setSelectedTag(null);
      const ta = textareaRef.current;
      if (ta) ta.style.height = 'auto';
      if (data.status === 'approved') {
        toast.success('Your post passed the AI content filter and is now live in the feed');
      } else {
        toast.info('Your post passed the AI filter and was submitted for review by the moderation team');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit post. Please try again.');
    } finally {
      stopEntranceSong();
      setSubmitting(false);
    }
  }, [text, images, videoFile, selectedTag, session, submitting, removeVideo]);

  return (
    <div className="p-[18px] mb-[18px] bg-base-100 backdrop-blur-xl" style={{ borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--surface-strong)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold"
          style={{
            background: 'linear-gradient(to bottom right, #cbdde9, #cbdde9)',
            color: '#1c4f73',
            fontSize: 14,
          }}
        >
          {avatarInitials || 'U'}
        </div>
        <div className="flex-1">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              placeholder="Share your thoughts with the university..."
              rows={1}
              className="w-full outline-none resize-none p-3 px-4"
              style={{
                border: 'none',
                backgroundColor: 'var(--divider)',
                borderRadius: 'var(--radius-md)',
                fontSize: 14,
                minHeight: 48,
                color: 'var(--text)',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
            {submitting && <ScanOverlay label="TEXT" />}

            {images.length > 0 && (
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, minmax(0, 1fr))` }}>
                {images.map((src, i) => (
                  <div key={`${src.slice(0, 64)}-${i}`} className="relative overflow-hidden rounded-xl" style={{ aspectRatio: '1 / 1' }}>
                    <img src={src} alt={`Upload preview ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1.5 right-1.5 z-20 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer border-none"
                    >
                      <X size={14} />
                    </button>
                    {submitting && <ScanOverlay label="PHOTO" />}
                  </div>
                ))}
              </div>
            )}

            {videoUrl && (
              <div className="relative mt-3 overflow-hidden rounded-xl" style={{ border: '1px solid var(--surface-border)' }}>
                <video src={videoUrl} controls muted playsInline className="w-full object-contain" style={{ maxHeight: 260 }} />
                <button
                  onClick={removeVideo}
                  className="absolute top-2 right-2 z-20 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer border-none"
                >
                  <X size={16} />
                </button>
                {submitting && <ScanOverlay label="VIDEO" />}
              </div>
            )}

          <div className="mt-2.5 flex gap-1.5 flex-wrap">
            {visibleTags.map((tag) => {
              const active = selectedTag === tag.label;
              return (
                <button
                  key={tag.label}
                  onClick={() => toggleTag(tag.label)}
                  className="px-2.5 py-1 text-xs font-medium rounded-full cursor-pointer transition-all border-none"
                  style={{
                    backgroundColor: active ? 'rgba(40, 114, 161,0.15)' : 'var(--divider)',
                    color: active ? 'var(--primary)' : 'var(--text-light)',
                  }}
                >
                  {tag.emoji} {tag.label}
                </button>
              );
            })}
          </div>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--surface)' }}>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!!videoFile || images.length >= MAX_IMAGES}
                className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer font-medium transition-all border-none disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--divider)',
                  border: '1.5px solid var(--surface-border)',
                  fontSize: 13,
                  color: images.length > 0 ? 'var(--primary)' : 'var(--text-light)',
                }}
              >
                <ImageIcon size={14} /> {images.length > 0 ? `${images.length}/${MAX_IMAGES} Photos` : 'Add Photo'}
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={images.length > 0}
                className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer font-medium transition-all border-none disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--divider)',
                  border: '1.5px solid var(--surface-border)',
                  fontSize: 13,
                  color: videoFile ? 'var(--primary)' : 'var(--text-light)',
                }}
              >
                <Video size={14} /> {videoFile ? 'Video Added' : 'Add Video'}
              </button>
            </div>
            <button
              onClick={handlePost}
              disabled={(!text.trim() && images.length === 0 && !videoFile) || submitting}
              className="flex items-center gap-1.5 px-4 py-1.5 cursor-pointer font-semibold border-none disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(var(--primary), var(--primary-dark))',
                color: '#fff',
                fontSize: 13,
                boxShadow: '0 2px 8px rgba(40, 114, 161,0.25)',
              }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
