/**
 * Utility for parsing Encapsulated PostScript (.eps) files
 * Extracts embedded thumbnails/previews (JPEG and TIFF) and Document Structuring Comments (DSC)
 */

export interface EpsExtractedInfo {
  hasPreview: boolean;
  previewDataUrl?: string;
  previewBase64?: string;
  previewMimeType?: string;
  title?: string;
  keywords?: string;
  subject?: string;
}

/**
 * Extracts embedded raster preview or header metadata from an EPS file
 */
export async function extractEpsInfo(file: File | Blob): Promise<EpsExtractedInfo> {
  const result: EpsExtractedInfo = { hasPreview: false };

  try {
    // Read up to 4MB of the EPS file to ensure embedded previews and deep metadata are captured
    const scanSize = Math.min(file.size, 4 * 1024 * 1024);
    const buffer = await file.slice(0, scanSize).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Also get tail bytes if file is larger than 1MB (PostScript trailers often contain XMP or layer tables)
    let tailChunk = '';
    if (file.size > 1024 * 1024) {
      try {
        const tailSlice = file.slice(Math.max(0, file.size - 512 * 1024), file.size);
        const tailBuffer = await tailSlice.arrayBuffer();
        tailChunk = new TextDecoder('latin1').decode(new Uint8Array(tailBuffer));
      } catch (e) {
        // ignore
      }
    }

    // 1. Check for DOS EPS Binary Header (0xC5 0xD0 0xD3 0xC6)
    if (bytes.length >= 30 && bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) {
      const view = new DataView(buffer);
      const tiffOffset = view.getUint32(20, true);
      const tiffLength = view.getUint32(24, true);

      if (tiffOffset > 0 && tiffLength > 0 && tiffOffset + tiffLength <= file.size) {
        const previewBlob = file.slice(tiffOffset, tiffOffset + tiffLength);
        const previewBytes = new Uint8Array(await previewBlob.slice(0, 16).arrayBuffer());

        // 1a. Check if preview is JPEG (0xFF 0xD8 0xFF)
        if (previewBytes[0] === 0xff && previewBytes[1] === 0xd8 && previewBytes[2] === 0xff) {
          const base64 = await blobToBase64String(previewBlob);
          result.hasPreview = true;
          result.previewMimeType = 'image/jpeg';
          result.previewBase64 = base64;
          result.previewDataUrl = `data:image/jpeg;base64,${base64}`;
        } else if (
          (previewBytes[0] === 0x49 && previewBytes[1] === 0x49 && previewBytes[2] === 0x2a) ||
          (previewBytes[0] === 0x4d && previewBytes[1] === 0x4d && previewBytes[3] === 0x2a)
        ) {
          // 1b. Check if preview is TIFF
          const tiffBuffer = await previewBlob.arrayBuffer();
          const tiffDataUrl = parseTiffToPngDataUrl(tiffBuffer);
          if (tiffDataUrl) {
            result.hasPreview = true;
            result.previewMimeType = 'image/png';
            result.previewBase64 = tiffDataUrl.replace(/^data:image\/png;base64,/, '');
            result.previewDataUrl = tiffDataUrl;
          }
        }
      }
    }

    // 2. Scan for JPEG markers (0xFF 0xD8 0xFF) in the stream if no preview yet
    if (!result.hasPreview) {
      for (let i = 0; i < bytes.length - 10; i++) {
        if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
          let endIdx = -1;
          for (let j = i + 10; j < Math.min(bytes.length - 1, i + 3 * 1024 * 1024); j++) {
            if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
              endIdx = j + 2;
              break;
            }
          }
          if (endIdx > i && endIdx - i > 100) {
            const jpegSlice = file.slice(i, endIdx, 'image/jpeg');
            const base64 = await blobToBase64String(jpegSlice);
            result.hasPreview = true;
            result.previewMimeType = 'image/jpeg';
            result.previewBase64 = base64;
            result.previewDataUrl = `data:image/jpeg;base64,${base64}`;
            break;
          }
        }
      }
    }

    // 3. Scan for Illustrator %AI7_Thumbnail or EPSI %%BeginPreview in text header
    const textDecoder = new TextDecoder('latin1');
    const textChunk = textDecoder.decode(bytes);
    const combinedText = tailChunk ? `${textChunk}\n${tailChunk}` : textChunk;

    if (!result.hasPreview) {
      // 3a. Adobe Illustrator %AI7_Thumbnail
      const aiThumbMatch = combinedText.match(/%AI7_Thumbnail:\s*(\d+)\s+(\d+)\s+(\d+)/);
      if (aiThumbMatch) {
        const aiDataUrl = parseAiThumbnailToPngDataUrl(aiThumbMatch[0], combinedText);
        if (aiDataUrl) {
          result.hasPreview = true;
          result.previewMimeType = 'image/png';
          result.previewBase64 = aiDataUrl.replace(/^data:image\/png;base64,/, '');
          result.previewDataUrl = aiDataUrl;
        }
      }

      // 3b. EPSI %%BeginPreview: <width> <height> <depth> <lines>
      if (!result.hasPreview) {
        const epsiMatch = combinedText.match(/%%BeginPreview:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (epsiMatch) {
          const epsiDataUrl = parseEpsiThumbnailToPngDataUrl(epsiMatch[0], combinedText);
          if (epsiDataUrl) {
            result.hasPreview = true;
            result.previewMimeType = 'image/png';
            result.previewBase64 = epsiDataUrl.replace(/^data:image\/png;base64,/, '');
            result.previewDataUrl = epsiDataUrl;
          }
        }
      }
    }

function isBoilerplateText(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('stipple photo maker') ||
    lower.includes('photocopy maker') ||
    lower.includes('generated by') ||
    lower.includes('procedural svg') ||
    lower.includes('vector objects') ||
    lower.includes('pure procedural') ||
    lower.includes('natural svg') ||
    lower.includes('vector artwork') ||
    lower.includes('autotrace') ||
    lower.includes('vectorizer') ||
    lower.length > 50
  );
}

    // 4. Extract Title / Keywords from DSC comments
    const titleMatch = combinedText.match(/^%%Title:\s*(.+)$/m);
    if (titleMatch) {
      const rawTitle = titleMatch[1].trim();
      if (!rawTitle.toLowerCase().endsWith('.eps') && !/^\d+[\s\(\)\-_]*$/.test(rawTitle) && !isBoilerplateText(rawTitle)) {
        result.title = rawTitle;
      }
    }

    const keywordsMatch = combinedText.match(/^%%Keywords:\s*(.+)$/m);
    if (keywordsMatch && !isBoilerplateText(keywordsMatch[1])) result.keywords = keywordsMatch[1].trim();

    const subjectMatch = combinedText.match(/^%%Subject:\s*(.+)$/m);
    if (subjectMatch && !isBoilerplateText(subjectMatch[1])) result.subject = subjectMatch[1].trim();

    // 5. Extract XMP metadata block (<x:xmpmeta>)
    const xmpStart = combinedText.indexOf('<x:xmpmeta');
    if (xmpStart !== -1) {
      const xmpEnd = combinedText.indexOf('</x:xmpmeta>', xmpStart);
      const xmpBlock = combinedText.substring(xmpStart, xmpEnd !== -1 ? xmpEnd + 12 : xmpStart + 25000);

      const dcTitle =
        xmpBlock.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/i) ||
        xmpBlock.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
      if (dcTitle && !result.title && !isBoilerplateText(dcTitle[1])) result.title = dcTitle[1].trim();

      const dcDesc =
        xmpBlock.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/i) ||
        xmpBlock.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
      if (dcDesc && !result.subject && !isBoilerplateText(dcDesc[1])) result.subject = dcDesc[1].trim();

      const tagMatches = [...xmpBlock.matchAll(/<rdf:li[^>]*>([^<]+)<\/rdf:li>/gi)];
      if (tagMatches.length > 0 && !result.keywords) {
        const extracted = tagMatches
          .map((m) => m[1].trim())
          .filter((t) => t.length > 1 && !t.includes('http') && !t.includes('uuid'));
        if (extracted.length > 0) {
          result.keywords = Array.from(new Set(extracted)).join(', ');
        }
      }
    }

    // 6. Deep scan Adobe Illustrator Layer names (e.g. %AI5_BeginLayer, %AI5_LayerName: (lemon))
    if (!result.subject) {
      const layerMatches = [
        ...combinedText.matchAll(/%AI5_LayerName:\s*\(([^)]+)\)/gi),
        ...combinedText.matchAll(/%LayerName:\s*\(([^)]+)\)/gi),
        ...combinedText.matchAll(/\/Layer\s*\(([^)]+)\)/gi)
      ];
      for (const lm of layerMatches) {
        const rawLayer = lm[1].trim();
        const cleanLayer = rawLayer.replace(/Layer\s*\d*/gi, '').replace(/[_\d\(\)\-]+/g, ' ').trim();
        if (cleanLayer.length >= 3 && !/^(background|guide|outline|shadow|base)$/i.test(cleanLayer)) {
          result.subject = cleanLayer;
          break;
        }
      }
    }

    // 7. Comprehensive dictionary scan across full PostScript text
    if (!result.subject) {
      const commonSubjects = [
        'lemon', 'citrus', 'lime', 'orange', 'apple', 'banana', 'strawberry', 'cherry', 'cherries',
        'grape', 'mango', 'peach', 'pineapple', 'watermelon', 'avocado', 'tomato', 'pear', 'plum',
        'pomegranate', 'blueberry', 'raspberry', 'blackberry', 'kiwi', 'coconut', 'fig', 'olive',
        'garlic', 'onion', 'mushroom', 'pepper', 'chili', 'carrot', 'pumpkin', 'corn', 'fruit', 'vegetable',
        'lotus', 'dahlia', 'rose', 'orchid', 'sunflower', 'tulip', 'daisy', 'flower', 'floral', 'botanical',
        'cat', 'dog', 'lion', 'tiger', 'bird', 'eagle', 'elephant', 'horse', 'butterfly',
        'coffee', 'tea', 'cup', 'bottle', 'vintage car', 'car', 'motorcycle', 'bicycle', 'airplane'
      ];
      const lowerFull = combinedText.toLowerCase();
      for (const subj of commonSubjects) {
        // Look for layer names, comments, string literals e.g. (lemon), /lemon, _lemon
        if (
          lowerFull.includes(`(${subj})`) ||
          lowerFull.includes(`/${subj}`) ||
          lowerFull.includes(`_${subj}`) ||
          lowerFull.includes(`-${subj}`) ||
          lowerFull.includes(` ${subj} `)
        ) {
          result.subject = subj;
          break;
        }
      }
    }
  } catch (err) {
    console.warn('EPS preview extraction notice:', err);
  }

  return result;
}

/**
 * Validates that canvas has actual visual detail and is NOT a solid black/blank corrupted decode
 */
function isUsableImageData(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const totalPixels = width * height;
    if (totalPixels <= 0) return false;

    const imgData = ctx.getImageData(0, 0, width, height).data;
    const step = Math.max(1, Math.floor(totalPixels / 2000));
    let samples = 0;
    let blackCount = 0;
    let whiteCount = 0;
    let sumBrightness = 0;

    for (let i = 0; i < imgData.length; i += step * 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const a = imgData[i + 3];

      if (a < 128) continue;
      samples++;
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      sumBrightness += brightness;

      if (brightness < 18) blackCount++;
      if (brightness > 240) whiteCount++;
    }

    if (samples < 15) return false;
    const blackRatio = blackCount / samples;
    const whiteRatio = whiteCount / samples;
    const avgBrightness = sumBrightness / samples;

    // Reject corrupt decoding that produces solid black squares
    if (blackRatio > 0.88 || avgBrightness < 12) {
      console.warn('Extracted thumbnail rejected: image is solid pitch black (corrupted decode)');
      return false;
    }

    // Reject totally blank white images
    if (whiteRatio > 0.98) {
      console.warn('Extracted thumbnail rejected: image is pure blank white');
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Decodes Adobe Illustrator %AI7_Thumbnail hex image to PNG DataURL
 */
function parseAiThumbnailToPngDataUrl(headerLine: string, text: string): string | null {
  try {
    const match = headerLine.match(/%AI7_Thumbnail:\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (!match) return null;
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    const depth = parseInt(match[3], 10);
    if (w <= 0 || h <= 0 || w > 800 || h > 800) return null;

    const startIdx = text.indexOf(headerLine);
    if (startIdx === -1) return null;

    const lines = text.slice(startIdx, startIdx + 300000).split(/\r?\n/);
    let hex = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('%%End') || line.startsWith('%%Trailer') || line.startsWith('%%EOF')) break;
      if (line.startsWith('%')) {
        hex += line.replace(/^%\s*/, '').replace(/[^0-9a-fA-F]/g, '');
      }
    }

    if (!hex || hex.length < w * h * 2) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fill with clean white backdrop first
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    if (depth === 24) {
      let hexIdx = 0;
      for (let p = 0; p < w * h; p++) {
        if (hexIdx + 6 > hex.length) break;
        const dst = p * 4;
        data[dst] = parseInt(hex.substring(hexIdx, hexIdx + 2), 16) || 0;
        data[dst + 1] = parseInt(hex.substring(hexIdx + 2, hexIdx + 4), 16) || 0;
        data[dst + 2] = parseInt(hex.substring(hexIdx + 4, hexIdx + 6), 16) || 0;
        data[dst + 3] = 255;
        hexIdx += 6;
      }
    } else {
      let hexIdx = 0;
      for (let p = 0; p < w * h; p++) {
        if (hexIdx + 2 > hex.length) break;
        const dst = p * 4;
        const gray = parseInt(hex.substring(hexIdx, hexIdx + 2), 16) || 0;
        data[dst] = gray;
        data[dst + 1] = gray;
        data[dst + 2] = gray;
        data[dst + 3] = 255;
        hexIdx += 2;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Guard: check if the resulting thumbnail is valid and not corrupted black
    if (!isUsableImageData(ctx, w, h)) {
      return null;
    }

    return canvas.toDataURL('image/png');
  } catch (err) {
    return null;
  }
}

/**
 * Decodes EPSI %%BeginPreview hex stream to PNG DataURL
 */
function parseEpsiThumbnailToPngDataUrl(headerLine: string, text: string): string | null {
  try {
    const match = headerLine.match(/%%BeginPreview:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (!match) return null;
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    const depth = parseInt(match[3], 10) || 1;
    if (w <= 0 || h <= 0 || w > 1200 || h > 1200) return null;

    const startIdx = text.indexOf(headerLine);
    if (startIdx === -1) return null;

    const lines = text.slice(startIdx, startIdx + 400000).split(/\r?\n/);
    let hex = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('%%EndPreview') || line.startsWith('%%End') || line.startsWith('%%Trailer')) break;
      if (line.startsWith('%')) {
        hex += line.replace(/^%\s*/, '').replace(/[^0-9a-fA-F]/g, '');
      }
    }

    if (!hex || hex.length < 16) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    if (depth === 1) {
      // 1-bit bilevel
      let byteIdx = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const charPos = Math.floor(byteIdx / 8) * 2;
          if (charPos + 2 > hex.length) break;
          const byteVal = parseInt(hex.substring(charPos, charPos + 2), 16) || 0;
          const bitVal = (byteVal >> (7 - (byteIdx % 8))) & 1;
          const dstIdx = (y * w + x) * 4;
          const gray = bitVal === 1 ? 0 : 255;
          data[dstIdx] = gray;
          data[dstIdx + 1] = gray;
          data[dstIdx + 2] = gray;
          data[dstIdx + 3] = 255;
          byteIdx++;
        }
      }
    } else {
      // Grayscale 8-bit
      let hexIdx = 0;
      for (let p = 0; p < w * h; p++) {
        if (hexIdx + 2 > hex.length) break;
        const val = parseInt(hex.substring(hexIdx, hexIdx + 2), 16) || 0;
        const dstIdx = p * 4;
        data[dstIdx] = val;
        data[dstIdx + 1] = val;
        data[dstIdx + 2] = val;
        data[dstIdx + 3] = 255;
        hexIdx += 2;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    if (!isUsableImageData(ctx, w, h)) {
      return null;
    }

    return canvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
}

/**
 * Decompress standard PackBits TIFF stream
 */
function decompressPackBits(input: Uint8Array, expectedLength: number): Uint8Array {
  const output = new Uint8Array(expectedLength);
  let inIdx = 0;
  let outIdx = 0;

  while (inIdx < input.length && outIdx < expectedLength) {
    const n = input[inIdx++];
    if (n <= 127) {
      const count = n + 1;
      for (let i = 0; i < count && inIdx < input.length && outIdx < expectedLength; i++) {
        output[outIdx++] = input[inIdx++];
      }
    } else if (n >= 129) {
      const count = 257 - n;
      const val = inIdx < input.length ? input[inIdx++] : 0;
      for (let i = 0; i < count && outIdx < expectedLength; i++) {
        output[outIdx++] = val;
      }
    }
  }
  return output;
}

/**
 * Basic TIFF preview parser to convert uncompressed or PackBits TIFF into PNG DataURL
 */
function parseTiffToPngDataUrl(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer);
    const isLE = view.getUint16(0, false) === 0x4949;
    const ifdOffset = view.getUint32(4, isLE);

    if (ifdOffset >= buffer.byteLength) return null;

    const numEntries = view.getUint16(ifdOffset, isLE);
    let width = 0;
    let height = 0;
    let stripOffset = 0;
    let stripByteCount = 0;
    let bitsPerSample = 8;
    let samplesPerPixel = 1;
    let photometric = 1;
    let compression = 1;

    for (let i = 0; i < numEntries; i++) {
      const entryPos = ifdOffset + 2 + i * 12;
      if (entryPos + 12 > buffer.byteLength) break;

      const tag = view.getUint16(entryPos, isLE);
      const val = view.getUint32(entryPos + 8, isLE);

      if (tag === 256) width = val;
      else if (tag === 257) height = val;
      else if (tag === 258) bitsPerSample = val & 0xffff;
      else if (tag === 259) compression = val & 0xffff;
      else if (tag === 262) photometric = val;
      else if (tag === 273) stripOffset = val;
      else if (tag === 277) samplesPerPixel = val;
      else if (tag === 279) stripByteCount = val;
    }

    if (width <= 0 || height <= 0 || stripOffset <= 0) return null;
    if (width > 2000 || height > 2000) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const rawSlice = new Uint8Array(
      buffer,
      stripOffset,
      Math.min(stripByteCount || buffer.byteLength - stripOffset, buffer.byteLength - stripOffset)
    );

    let pixelBytes: Uint8Array = rawSlice;
    if (compression === 32773) {
      const expectedSize =
        bitsPerSample === 1
          ? Math.ceil(width / 8) * height
          : width * height * (samplesPerPixel || 1);
      pixelBytes = new Uint8Array(decompressPackBits(rawSlice, expectedSize));
    }

    if (samplesPerPixel === 3 || samplesPerPixel === 4) {
      let srcIdx = 0;
      for (let p = 0; p < width * height; p++) {
        const dstIdx = p * 4;
        data[dstIdx] = pixelBytes[srcIdx] || 0;
        data[dstIdx + 1] = pixelBytes[srcIdx + 1] || 0;
        data[dstIdx + 2] = pixelBytes[srcIdx + 2] || 0;
        data[dstIdx + 3] = 255;
        srcIdx += samplesPerPixel;
      }
    } else if (bitsPerSample === 1) {
      const bytesPerRow = Math.ceil(width / 8);
      for (let y = 0; y < height; y++) {
        const rowStart = y * bytesPerRow;
        for (let x = 0; x < width; x++) {
          const byteIndex = rowStart + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          const bit = (pixelBytes[byteIndex] >> bitIndex) & 1;
          const dstIdx = (y * width + x) * 4;
          const isBlack = photometric === 0 ? bit === 1 : bit === 0;
          const gray = isBlack ? 0 : 255;
          data[dstIdx] = gray;
          data[dstIdx + 1] = gray;
          data[dstIdx + 2] = gray;
          data[dstIdx + 3] = 255;
        }
      }
    } else {
      let srcIdx = 0;
      for (let p = 0; p < width * height; p++) {
        const dstIdx = p * 4;
        const val = pixelBytes[srcIdx] || 0;
        const gray = photometric === 0 ? 255 - val : val;
        data[dstIdx] = gray;
        data[dstIdx + 1] = gray;
        data[dstIdx + 2] = gray;
        data[dstIdx + 3] = 255;
        srcIdx++;
      }
    }

    // Auto-invert: if preview is inverted (black background with white artwork),
    // invert to clean black artwork on white background so it passes validation and vision models
    let darkPixels = 0;
    const sampleStep = Math.max(1, Math.floor((width * height) / 1000));
    let totalSampled = 0;
    for (let p = 0; p < width * height; p += sampleStep) {
      const idx = p * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (lum < 35) darkPixels++;
      totalSampled++;
    }
    if (totalSampled > 0 && darkPixels / totalSampled > 0.72) {
      for (let p = 0; p < width * height; p++) {
        const idx = p * 4;
        data[idx] = 255 - data[idx];
        data[idx + 1] = 255 - data[idx + 1];
        data[idx + 2] = 255 - data[idx + 2];
      }
    }

    ctx.putImageData(imgData, 0, 0);

    if (!isUsableImageData(ctx, width, height)) {
      return null;
    }

    return canvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
}

function blobToBase64String(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

