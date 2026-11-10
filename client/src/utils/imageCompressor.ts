/**
 * High-Efficiency Client-Side Image Pre-Compression Utility
 * AMA Ceramics Quotation & Dispatch Management System
 *
 * Uses native HTML5 Canvas & ImageBitmap to compress payment receipts,
 * proofs, and product photos down to lightweight .webp format (max 1600px, 0.80 quality)
 * before transmission across showroom Wi-Fi networks.
 */

export interface ImageCompressionOptions {
  maxDimension?: number;
  quality?: number;
  minSizeThresholdBytes?: number;
}

export async function compressImageFile(
  file: File,
  options?: ImageCompressionOptions
): Promise<File> {
  const maxDim = options?.maxDimension ?? 1600;
  const quality = options?.quality ?? 0.80;
  const minThreshold = options?.minSizeThresholdBytes ?? 200 * 1024; // 200 KB

  // 1. Non-images (e.g. PDFs) or very small files bypass compression
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // 2. SVG and GIF files retain original vector/animation characteristics
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  // 3. Skip re-encoding if file is already lightweight (under threshold)
  if (file.size <= minThreshold) {
    return file;
  }

  try {
    let imgWidth = 0;
    let imgHeight = 0;
    let sourceDrawable: ImageBitmap | HTMLImageElement;

    // Use fast native ImageBitmap if supported in browser environment
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      imgWidth = bitmap.width;
      imgHeight = bitmap.height;
      sourceDrawable = bitmap;
    } else {
      // Fallback to standard Image element
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for compression'));
        img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      imgWidth = img.naturalWidth || img.width;
      imgHeight = img.naturalHeight || img.height;
      sourceDrawable = img;
    }

    // Calculate proportional aspect ratio scaling capped at maxDim
    let targetWidth = imgWidth;
    let targetHeight = imgHeight;

    if (imgWidth > maxDim || imgHeight > maxDim) {
      if (imgWidth >= imgHeight) {
        targetHeight = Math.round((imgHeight * maxDim) / imgWidth);
        targetWidth = maxDim;
      } else {
        targetWidth = Math.round((imgWidth * maxDim) / imgHeight);
        targetHeight = maxDim;
      }
    }

    // Render to Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
      return file;
    }

    // Fill white background to handle transparency when converting to lossy WebP
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(sourceDrawable, 0, 0, targetWidth, targetHeight);

    // Clean up ImageBitmap memory if applicable
    if ('close' in sourceDrawable && typeof sourceDrawable.close === 'function') {
      sourceDrawable.close();
    }

    // Convert to modern WebP blob
    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });

    if (!compressedBlob) {
      return file;
    }

    // If compressed output is somehow larger than the original, keep original
    if (compressedBlob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const optimizedFileName = `${baseName}.webp`;

    return new File([compressedBlob], optimizedFileName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[ImageCompressor] Fallback to original file due to:', err);
    return file;
  }
}
