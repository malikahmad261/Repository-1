export interface PreparedImage {
  blob: Blob;
  base64: string;
  mediaType: 'image/jpeg';
  previewUrl: string;
}

/**
 * Shrinks a photo to at most `maxDim` px on its longest side and re-encodes it
 * as JPEG. Keeps uploads small (and converts iPhone HEIC photos to JPEG).
 */
export async function prepareImage(file: File, maxDim = 1600, quality = 0.82): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't open this image."));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process this image."))), 'image/jpeg', quality),
    );
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { blob, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
