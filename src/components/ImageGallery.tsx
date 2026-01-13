import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageGalleryLightbox({ images, initialIndex = 0, open, onOpenChange }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setZoom(1);
    }
  }, [open, initialIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setZoom(1);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setZoom(1);
  }, [images.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
    if (e.key === 'Escape') onOpenChange(false);
  }, [open, goNext, goPrev, onOpenChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.5, 3));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5));

  if (images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 bg-black/95 border-none">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-6 w-6" />
        </Button>

        {/* Controls */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={zoomOut}>
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="text-white text-sm min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={zoomIn}>
            <ZoomIn className="h-5 w-5" />
          </Button>
          <div className="w-px h-6 bg-white/30 mx-2" />
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" asChild>
            <a href={images[currentIndex]} download target="_blank" rel="noopener noreferrer">
              <Download className="h-5 w-5" />
            </a>
          </Button>
        </div>

        {/* Counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-black/50 rounded-full px-4 py-2">
          <span className="text-white text-sm">
            {currentIndex + 1} / {images.length}
          </span>
        </div>

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-50 text-white hover:bg-white/20 h-12 w-12"
              onClick={goPrev}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-50 text-white hover:bg-white/20 h-12 w-12"
              onClick={goNext}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </>
        )}

        {/* Image */}
        <div className="w-full h-full flex items-center justify-center overflow-auto p-8">
          <img
            src={images[currentIndex]}
            alt={`Image ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
            draggable={false}
          />
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 flex gap-2 bg-black/50 rounded-lg p-2 max-w-[80vw] overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => { setCurrentIndex(idx); setZoom(1); }}
                className={cn(
                  'w-16 h-12 rounded overflow-hidden border-2 transition-all flex-shrink-0',
                  idx === currentIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ImageGalleryGridProps {
  images: string[];
  emptyMessage?: string;
  emptySubMessage?: string;
  EmptyIcon?: React.ComponentType<{ className?: string }>;
}

export function ImageGalleryGrid({ images, emptyMessage, emptySubMessage, EmptyIcon }: ImageGalleryGridProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
  };

  if (!images || images.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {EmptyIcon && <EmptyIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />}
        {emptyMessage && <p>{emptyMessage}</p>}
        {emptySubMessage && <p className="text-sm mt-2">{emptySubMessage}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {images.map((url, index) => (
          <button
            key={index}
            onClick={() => openLightbox(index)}
            className="relative group rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
          >
            <img
              src={url}
              alt={`Screenshot ${index + 1}`}
              className="w-full h-auto"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
              {index + 1}/{images.length}
            </div>
          </button>
        ))}
      </div>

      <ImageGalleryLightbox
        images={images}
        initialIndex={selectedIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  );
}
