/**
 * Professional Image Metadata Embedder for JPEG, PNG, and WEBP.
 * Injects synchronized EXIF, IPTC-NAA, and Adobe XMP metadata directly into binary buffers in-place.
 */

import { VectorMetadata, generateAdobeXmpPacket } from './svgToEps';
import { embedXmpIntoJpegBuffer, buildExifApp1Segment } from './jpegMetadata';

/**
 * Calculates standard CRC32 for PNG chunks
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function calculateCrc32(bytes: Uint8Array, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = 0; i < length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[offset + i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a single PNG chunk: length (4) + type (4) + data (N) + CRC (4)
 */
function buildPngChunk(typeStr: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false); // big-endian
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = typeStr.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crc = calculateCrc32(chunk, 4, 4 + data.length);
  view.setUint32(8 + data.length, crc, false);
  return chunk;
}

/**
 * Builds a PNG tEXt chunk (keyword + \0 + text)
 */
function buildPngTextChunk(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const kwBytes = enc.encode(keyword);
  const txtBytes = enc.encode(text);
  const data = new Uint8Array(kwBytes.length + 1 + txtBytes.length);
  data.set(kwBytes, 0);
  data[kwBytes.length] = 0; // null separator
  data.set(txtBytes, kwBytes.length + 1);
  return buildPngChunk('tEXt', data);
}

/**
 * Injects Adobe XMP metadata, tEXt tags, and eXIf chunk into a PNG ArrayBuffer
 */
export function embedXmpIntoPngBuffer(pngBuffer: ArrayBuffer, metadata: VectorMetadata): ArrayBuffer {
  const bytes = new Uint8Array(pngBuffer);

  // Validate PNG signature: \x89PNG\r\n\x1a\n
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    throw new Error('Invalid PNG signature');
  }

  const chunksToInsert: Uint8Array[] = [];

  // 1. iTXt chunk for Adobe XMP
  const xmpString = generateAdobeXmpPacket(metadata);
  const encoder = new TextEncoder();
  const keywordBytes = encoder.encode('XML:com.adobe.xmp');
  const flagsAndTags = new Uint8Array([0, 0, 0, 0]); // null, null, null, null
  const xmpBytes = encoder.encode(xmpString);
  const itxtData = new Uint8Array(keywordBytes.length + 1 + flagsAndTags.length + xmpBytes.length);
  itxtData.set(keywordBytes, 0);
  itxtData[keywordBytes.length] = 0;
  itxtData.set(flagsAndTags, keywordBytes.length + 1);
  itxtData.set(xmpBytes, keywordBytes.length + 1 + flagsAndTags.length);
  chunksToInsert.push(buildPngChunk('iTXt', itxtData));

  // 2. Standard tEXt chunks for Title, Description, Author, Comment
  if (metadata.title) {
    chunksToInsert.push(buildPngTextChunk('Title', metadata.title));
  }
  if (metadata.description) {
    chunksToInsert.push(buildPngTextChunk('Description', metadata.description));
  }
  if (metadata.keywords) {
    chunksToInsert.push(buildPngTextChunk('Comment', metadata.keywords));
  }

  // 3. eXIf chunk with TIFF EXIF buffer for Windows Explorer Details & stock photo engines
  try {
    const exifApp1 = buildExifApp1Segment(metadata);
    // In buildExifApp1Segment, the segment starts with 0xFF, 0xE1, len(2), 'Exif\0\0'(6), then TIFF buffer
    if (exifApp1.length > 10) {
      const tiffData = exifApp1.subarray(10);
      chunksToInsert.push(buildPngChunk('eXIf', tiffData));
    }
  } catch (e) {
    console.warn('Could not construct eXIf chunk for PNG:', e);
  }

  let totalInsertLen = 0;
  for (const c of chunksToInsert) totalInsertLen += c.length;

  // Insert directly after IHDR chunk (signature: 8 bytes + IHDR length (4) + type (4) + data (13) + crc (4) = 33)
  const ihdrLength =
    (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
  const insertPos = 8 + 4 + 4 + ihdrLength + 4;

  const result = new Uint8Array(bytes.length + totalInsertLen);
  result.set(bytes.subarray(0, insertPos), 0);

  let currentPos = insertPos;
  for (const c of chunksToInsert) {
    result.set(c, currentPos);
    currentPos += c.length;
  }

  result.set(bytes.subarray(insertPos), currentPos);

  return result.buffer;
}

/**
 * Injects Adobe XMP metadata into a WEBP ArrayBuffer using standard RIFF 'XMP ' chunk
 */
export function embedXmpIntoWebpBuffer(webpBuffer: ArrayBuffer, metadata: VectorMetadata): ArrayBuffer {
  const bytes = new Uint8Array(webpBuffer);

  // Validate RIFF WEBP header: 'RIFF' .... 'WEBP'
  const isRiff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isWebp =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

  if (!isRiff || !isWebp) {
    throw new Error('Invalid WEBP format');
  }

  const xmpString = generateAdobeXmpPacket(metadata);
  const encoder = new TextEncoder();
  const xmpBytes = encoder.encode(xmpString);

  // Standard WEBP 'XMP ' chunk: FourCC (4) + 4 bytes little-endian length + xmpBytes + padding byte if odd
  const needsPadding = xmpBytes.length % 2 !== 0;
  const chunkDataLength = xmpBytes.length;
  const totalChunkLength = 8 + chunkDataLength + (needsPadding ? 1 : 0);

  const xmpChunk = new Uint8Array(totalChunkLength);
  // 'XMP '
  xmpChunk[0] = 0x58; // 'X'
  xmpChunk[1] = 0x4d; // 'M'
  xmpChunk[2] = 0x50; // 'P'
  xmpChunk[3] = 0x20; // ' '

  // Length in little-endian
  xmpChunk[4] = chunkDataLength & 0xff;
  xmpChunk[5] = (chunkDataLength >> 8) & 0xff;
  xmpChunk[6] = (chunkDataLength >> 16) & 0xff;
  xmpChunk[7] = (chunkDataLength >> 24) & 0xff;

  xmpChunk.set(xmpBytes, 8);
  if (needsPadding) {
    xmpChunk[8 + chunkDataLength] = 0;
  }

  const result = new Uint8Array(bytes.length + xmpChunk.length);
  result.set(bytes, 0);
  result.set(xmpChunk, bytes.length);

  // Update total RIFF size at bytes[4..7] (little-endian)
  const newRiffSize = result.length - 8;
  result[4] = newRiffSize & 0xff;
  result[5] = (newRiffSize >> 8) & 0xff;
  result[6] = (newRiffSize >> 16) & 0xff;
  result[7] = (newRiffSize >> 24) & 0xff;

  return result.buffer;
}

/**
 * Universal dispatcher to embed metadata into any image format buffer
 */
export function embedMetadataIntoImage(
  buffer: ArrayBuffer,
  fileType: string,
  metadata: VectorMetadata
): ArrayBuffer {
  const type = (fileType || '').toLowerCase();
  if (type.includes('png')) {
    return embedXmpIntoPngBuffer(buffer, metadata);
  }
  if (type.includes('webp')) {
    return embedXmpIntoWebpBuffer(buffer, metadata);
  }
  // Default to JPEG / JPG
  return embedXmpIntoJpegBuffer(buffer, metadata);
}
