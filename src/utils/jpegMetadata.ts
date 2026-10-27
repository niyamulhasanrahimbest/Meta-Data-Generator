/**
 * High-Precision Universal JPEG Metadata Injector
 * Embeds synchronized EXIF (including Windows Explorer XP tags & 5-star rating),
 * Photoshop IPTC-NAA (stock photo platform standard), and Adobe XMP packets
 * directly into JPEG files without re-encoding or image quality degradation.
 */

// @ts-ignore
import piexif from 'piexifjs';
import { VectorMetadata, generateAdobeXmpPacket } from './svgToEps';

/**
 * Encodes string to UTF-16LE / UCS-2 LE with double null terminator (0x00 0x00).
 * Required by Microsoft Windows File Explorer for XPTitle, XPComment, XPAuthor, XPKeywords, XPSubject.
 */
function encodeUcs2Le(str: string): Uint8Array {
  const bytes = new Uint8Array((str.length + 1) * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = (code >> 8) & 0xff;
  }
  bytes[str.length * 2] = 0x00;
  bytes[str.length * 2 + 1] = 0x00;
  return bytes;
}

/**
 * Encodes string to ASCII byte array with trailing null
 */
function encodeAsciiNull(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length + 1);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0x7f;
  }
  bytes[str.length] = 0x00;
  return bytes;
}

/**
 * Encodes UTF-8 byte array
 */
function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Constructs a fully compliant TIFF/EXIF APP1 segment containing standard EXIF
 * and Windows File Explorer Properties tags (XPTitle, XPKeywords, Rating, etc.)
 */
export function buildExifApp1Segment(metadata: VectorMetadata): Uint8Array {
  const title = (metadata.title || '').trim();
  const description = (metadata.description || title).trim();

  // Windows Explorer "Tags" expect semicolon-delimited keywords
  const rawKeywords = (metadata.keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const xpKeywordsStr = rawKeywords.join('; ');

  const ratingVal = Math.min(5, Math.max(1, metadata.rating || 5));
  const ratingPercentVal = ratingVal * 20 - 1; // 5 -> 99

  function encodeUcs2Le(str: string): Uint8Array {
    const bytes = new Uint8Array((str.length + 1) * 2);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes[i * 2] = code & 0xff;
      bytes[i * 2 + 1] = (code >> 8) & 0xff;
    }
    bytes[str.length * 2] = 0x00;
    bytes[str.length * 2 + 1] = 0x00;
    return bytes;
  }

  function encodeAsciiNull(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length + 1);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0x7f;
    }
    bytes[str.length] = 0x00;
    return bytes;
  }

  type TagEntry =
    | { id: number; type: 3; val: number }
    | { id: number; type: 1 | 2; data: Uint8Array };

  const tags: TagEntry[] = [
    { id: 0x010e, type: 2, data: encodeAsciiNull(title || description) }, // ImageDescription
    { id: 0x4746, type: 3, val: ratingVal },                           // Rating (5-Star)
    { id: 0x4749, type: 3, val: ratingPercentVal },                    // RatingPercent (99)
    { id: 0x9c9b, type: 1, data: encodeUcs2Le(title) },                 // XPTitle
    { id: 0x9c9c, type: 1, data: encodeUcs2Le(description) },           // XPComment
    { id: 0x9c9e, type: 1, data: encodeUcs2Le(xpKeywordsStr) },         // XPKeywords
    { id: 0x9c9f, type: 1, data: encodeUcs2Le(description || title) }   // XPSubject
  ];

  tags.sort((a, b) => a.id - b.id);

  const numTags = tags.length;
  const ifdLen = 2 + numTags * 12 + 4;
  let totalExtraLen = 0;
  for (const tag of tags) {
    if (tag.type !== 3 && tag.data.length > 4) {
      totalExtraLen += tag.data.length + (tag.data.length % 2 !== 0 ? 1 : 0);
    }
  }

  const tiffTotalLen = 8 + ifdLen + totalExtraLen;
  const tiffBuf = new Uint8Array(tiffTotalLen);
  const view = new DataView(tiffBuf.buffer);

  // TIFF Header: Little Endian ('II', 42, offset to IFD0 = 8)
  tiffBuf[0] = 0x49;
  tiffBuf[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  // IFD0 Count
  view.setUint16(8, numTags, true);

  let entryPos = 10;
  let currDataOffset = 8 + ifdLen;

  for (const tag of tags) {
    view.setUint16(entryPos, tag.id, true);
    view.setUint16(entryPos + 2, tag.type, true);

    if (tag.type === 3) {
      // 16-bit SHORT stored directly in the 4-byte value field
      view.setUint32(entryPos + 4, 1, true); // count = 1
      view.setUint16(entryPos + 8, tag.val, true); // value
      view.setUint16(entryPos + 10, 0, true);
    } else {
      const len = tag.data.length;
      view.setUint32(entryPos + 4, len, true); // count of bytes
      if (len <= 4) {
        tiffBuf.set(tag.data, entryPos + 8);
      } else {
        view.setUint32(entryPos + 8, currDataOffset, true);
        tiffBuf.set(tag.data, currDataOffset);
        currDataOffset += len;
        if (len % 2 !== 0) {
          tiffBuf[currDataOffset] = 0x00;
          currDataOffset++;
        }
      }
    }
    entryPos += 12;
  }

  // Next IFD = 0
  view.setUint32(entryPos, 0, true);

  // Prepend 'Exif\0\0' (6 bytes)
  const exifPrefix = encodeUtf8('Exif\0\0');
  const app1PayloadLen = exifPrefix.length + tiffTotalLen;
  const markerLen = app1PayloadLen + 2;

  const app1Segment = new Uint8Array(2 + markerLen);
  app1Segment[0] = 0xff;
  app1Segment[1] = 0xe1;
  app1Segment[2] = (markerLen >> 8) & 0xff;
  app1Segment[3] = markerLen & 0xff;
  app1Segment.set(exifPrefix, 4);
  app1Segment.set(tiffBuf, 4 + exifPrefix.length);

  return app1Segment;
}

/**
 * Constructs an IPTC-NAA APP13 Photoshop segment (0xFFED)
 * Stock photo platforms (Shutterstock, Adobe Stock, Freepik) rely directly on this for metadata extraction.
 */
export function buildIptcApp13Segment(metadata: VectorMetadata): Uint8Array {
  const title = (metadata.title || '').trim();
  const description = (metadata.description || title).trim();
  const category = (metadata.category || 'Arts, Objects').trim();
  const rawKeywords = (metadata.keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const iptcChunks: Uint8Array[] = [];

  function addIptcTag(dataset: number, value: string | Uint8Array) {
    const valBytes = typeof value === 'string' ? encodeUtf8(value) : value;
    if (valBytes.length === 0) return;
    const chunk = new Uint8Array(5 + valBytes.length);
    chunk[0] = 0x1c;
    chunk[1] = 0x02;
    chunk[2] = dataset & 0xff;
    chunk[3] = (valBytes.length >> 8) & 0xff;
    chunk[4] = valBytes.length & 0xff;
    chunk.set(valBytes, 5);
    iptcChunks.push(chunk);
  }

  addIptcTag(0x00, new Uint8Array([0x00, 0x04]));
  addIptcTag(0x05, title);
  addIptcTag(0x0f, category);
  for (const kw of rawKeywords) {
    addIptcTag(0x19, kw);
  }
  addIptcTag(0x78, description);

  let totalIptcLen = 0;
  for (const c of iptcChunks) totalIptcLen += c.length;

  const iptcData = new Uint8Array(totalIptcLen);
  let iptcPos = 0;
  for (const c of iptcChunks) {
    iptcData.set(c, iptcPos);
    iptcPos += c.length;
  }

  // Photoshop 3.0 8BIM structure:
  // Signature: 'Photoshop 3.0\0' (14 bytes)
  // 8BIM Block: '8BIM' (4 bytes), 0x0404 (2 bytes), 0x0000 (2 bytes), Resource size (4 bytes), iptcData, pad if odd
  const psHeader = encodeUtf8('Photoshop 3.0\0');
  const padByte = iptcData.length % 2 !== 0 ? 1 : 0;
  const bimBlockLen = 4 + 2 + 2 + 4 + iptcData.length + padByte;

  const bimBlock = new Uint8Array(bimBlockLen);
  const bimView = new DataView(bimBlock.buffer);
  bimBlock.set(encodeUtf8('8BIM'), 0);
  bimView.setUint16(4, 0x0404, false); // IPTC-NAA resource ID (big-endian)
  bimView.setUint16(6, 0x0000, false); // Pascal string empty
  bimView.setUint32(8, iptcData.length, false); // IPTC data size
  bimBlock.set(iptcData, 12);
  if (padByte) bimBlock[12 + iptcData.length] = 0x00;

  const payloadLen = psHeader.length + bimBlock.length;
  const markerLen = payloadLen + 2;

  const app13 = new Uint8Array(2 + 2 + payloadLen);
  app13[0] = 0xff;
  app13[1] = 0xed;
  app13[2] = (markerLen >> 8) & 0xff;
  app13[3] = markerLen & 0xff;
  app13.set(psHeader, 4);
  app13.set(bimBlock, 4 + psHeader.length);

  return app13;
}

/**
 * Constructs an Adobe XMP APP1 segment (0xFFE1) with namespace http://ns.adobe.com/xap/1.0/
 */
export function buildXmpApp1Segment(metadata: VectorMetadata): Uint8Array {
  const xmpString = generateAdobeXmpPacket(metadata);
  const header = encodeUtf8('http://ns.adobe.com/xap/1.0/\0');
  const xmpBytes = encodeUtf8(xmpString);

  const payloadLen = header.length + xmpBytes.length;
  const markerLen = payloadLen + 2;

  const app1 = new Uint8Array(2 + 2 + payloadLen);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1[2] = (markerLen >> 8) & 0xff;
  app1[3] = markerLen & 0xff;
  app1.set(header, 4);
  app1.set(xmpBytes, 4 + header.length);

  return app1;
}

/**
 * Embeds synchronized EXIF + IPTC + XMP metadata directly into a JPEG ArrayBuffer or Uint8Array.
 * Lossless, instantaneous, with zero recompression.
 */
export function embedXmpIntoJpegBuffer(
  jpegInput: ArrayBuffer | Uint8Array,
  metadata: VectorMetadata
): ArrayBuffer {
  let bytes: Uint8Array;
  if (jpegInput instanceof Uint8Array) {
    bytes = new Uint8Array(jpegInput.buffer, jpegInput.byteOffset, jpegInput.byteLength);
  } else {
    bytes = new Uint8Array(jpegInput);
  }

  // Find SOI marker (0xFFD8) in case of leading stream offset, Node buffer pool header, or padding
  let soiIndex = -1;
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      soiIndex = i;
      break;
    }
  }

  if (soiIndex === -1) {
    throw new Error('Invalid JPEG format: Missing SOI marker (0xFFD8)');
  }

  if (soiIndex > 0) {
    bytes = bytes.subarray(soiIndex);
  }

  const exifSegment = buildExifApp1Segment(metadata);
  const xmpSegment = buildXmpApp1Segment(metadata);
  const iptcSegment = buildIptcApp13Segment(metadata);

  // Scan and parse existing JPEG markers before Start Of Scan (SOS: 0xFFDA)
  let pos = 2;
  const preservedSegments: Uint8Array[] = [];

  while (pos < bytes.length - 1) {
    if (bytes[pos] !== 0xff) {
      pos++;
      continue;
    }

    const marker = bytes[pos + 1];

    // Reached start of scan or end of image
    if (marker === 0xda || marker === 0xd9) {
      break;
    }

    // Standalone 2-byte markers (RST0-RST7, TEM)
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      preservedSegments.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const totalSegLen = 2 + segLen;

    // Filter out old APP0 (JFIF), old EXIF (APP1), XMP (APP1), and Photoshop (APP13) markers to prevent collision/stale data
    const isApp0 = marker === 0xe0;
    const isApp1 = marker === 0xe1;
    const isApp13 = marker === 0xed;

    if (!isApp0 && !isApp1 && !isApp13) {
      preservedSegments.push(bytes.subarray(pos, pos + totalSegLen));
    }

    pos += totalSegLen;
  }

  // The remaining slice is the image entropy scan data to EOI
  const remainingScanData = bytes.subarray(pos);

  // Compute total output size
  let outputSize = 2; // SOI (0xFF 0xD8)
  outputSize += exifSegment.length; // 1. APP1 EXIF (Must be first at offset 2 for Windows Explorer)
  outputSize += xmpSegment.length;  // 2. APP1 Adobe XMP
  outputSize += iptcSegment.length; // 3. APP13 Photoshop IPTC
  for (const s of preservedSegments) outputSize += s.length;
  outputSize += remainingScanData.length;

  const out = new Uint8Array(outputSize);
  out[0] = 0xff;
  out[1] = 0xd8;

  let outPos = 2;

  // 1. Comprehensive APP1 EXIF (Windows XPTitle, XPKeywords, Rating) - MUST BE AT OFFSET 2!
  out.set(exifSegment, outPos);
  outPos += exifSegment.length;

  // 2. APP1 Adobe XMP
  out.set(xmpSegment, outPos);
  outPos += xmpSegment.length;

  // 3. APP13 Photoshop IPTC
  out.set(iptcSegment, outPos);
  outPos += iptcSegment.length;

  // 4. Preserved DQT, SOF, DHT, etc.
  for (const s of preservedSegments) {
    out.set(s, outPos);
    outPos += s.length;
  }

  // 5. SOS scan data and EOI
  out.set(remainingScanData, outPos);

  return out.buffer;
}

/**
 * High-performance, memory-safe conversion from Uint8Array to base64.
 * Uses native Buffer in Electron/Node, or 32KB chunking in browser.
 * NEVER creates millions of individual character strings that cause OOM/black screen crashes.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Check global Buffer or Electron window.Buffer
  const NodeBuffer =
    typeof Buffer !== 'undefined'
      ? Buffer
      : (typeof window !== 'undefined' && (window as any).Buffer)
      ? (window as any).Buffer
      : null;

  if (NodeBuffer && typeof NodeBuffer.from === 'function') {
    return NodeBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }

  // Safe chunked conversion (32KB chunks) for browser
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 32768;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * High-performance, memory-safe conversion from base64 to Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const NodeBuffer =
    typeof Buffer !== 'undefined'
      ? Buffer
      : (typeof window !== 'undefined' && (window as any).Buffer)
      ? (window as any).Buffer
      : null;

  if (NodeBuffer && typeof NodeBuffer.from === 'function') {
    const buf = NodeBuffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
