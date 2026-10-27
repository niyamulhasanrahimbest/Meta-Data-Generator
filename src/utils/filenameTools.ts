import { MetadataItem } from '../types';

/**
 * Cleans ugly AI prompt-generated filenames
 * e.g., "0001_1_high-level-description-a-photorealistic-_WYbK" -> "photorealistic-black-and-white-stipple-lotus-flower"
 * or converts title to clean kebab-case filename
 */
export function cleanFilenames(items: MetadataItem[]): MetadataItem[] {
  return items.map(item => {
    let cleanName = item.filename;

    // Remove leading AI index pattern like 0001_1_
    cleanName = cleanName.replace(/^\d+_\d+_/, '');
    cleanName = cleanName.replace(/^high-level-description-?/i, '');
    cleanName = cleanName.replace(/_[A-Za-z0-9!#-]{4,8}$/, '');

    // Replace all dashes (-) and underscores (_) with spaces
    cleanName = cleanName.replace(/[-_]+/g, ' ');

    // Clean illegal OS characters while keeping spaces
    cleanName = cleanName.replace(/[\\/:*?"<>|]/g, ' ');

    // Collapse multiple consecutive spaces and trim
    cleanName = cleanName.replace(/\s+/g, ' ').trim();

    // If filename became empty, fallback to title (without dashes)
    if (!cleanName && item.title && !item.title.startsWith('Pending') && !item.title.startsWith('Error')) {
      cleanName = item.title
        .replace(/[-_]+/g, ' ')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (!cleanName) {
      cleanName = item.filename;
    }

    const extMatch =
      (item.originalName || '').match(/\.[0-9a-z0-9]+$/i) ||
      (item.filePath || '').match(/\.[0-9a-z0-9]+$/i);
    const ext = extMatch
      ? extMatch[0]
      : item.fileType === 'svg'
      ? '.svg'
      : item.fileType === 'eps'
      ? '.eps'
      : item.fileType === 'video'
      ? '.mp4'
      : '.jpg';

    const newOriginalName = cleanName.endsWith(ext) ? cleanName : `${cleanName}${ext}`;

    return {
      ...item,
      filename: cleanName,
      originalName: newOriginalName
    };
  });
}

/**
 * Batch rename with pattern
 */
export function batchRenameFiles(
  items: MetadataItem[],
  prefix: string = 'Vector_Asset_',
  startNumber: number = 1
): MetadataItem[] {
  return items.map((item, idx) => {
    const num = String(startNumber + idx).padStart(4, '0');
    const extMatch =
      (item.originalName || '').match(/\.[0-9a-z0-9]+$/i) ||
      (item.filePath || '').match(/\.[0-9a-z0-9]+$/i);
    const ext = extMatch
      ? extMatch[0]
      : item.fileType === 'svg'
      ? '.svg'
      : item.fileType === 'eps'
      ? '.eps'
      : item.fileType === 'video'
      ? '.mp4'
      : '.jpg';
    const newName = `${prefix}${num}`;
    return {
      ...item,
      filename: newName,
      originalName: `${newName}${ext}`
    };
  });
}

/**
 * Replaces every file's filename with its generated Title.
 * Works seamlessly across all formats: JPEG, JPG, PNG, WEBP, SVG, EPS, MP4, MOV, etc.
 * Handles thousands of files in milliseconds.
 * Sanitizes illegal OS filesystem characters (/ \ : * ? " < > |).
 * Ensures filename uniqueness when identical titles exist in a batch.
 */
export function renameFilesToTitle(items: MetadataItem[]): { items: MetadataItem[]; count: number } {
  let count = 0;
  const usedNames = new Map<string, number>();

  const updatedItems = items.map((item) => {
    const rawTitle = (item.title || '').trim();
    if (!rawTitle || rawTitle.startsWith('Pending') || rawTitle.startsWith('Error')) {
      return item;
    }

    // Clean illegal OS filesystem characters while keeping title natural and readable
    let sanitized = rawTitle
      .replace(/[\\/:*?"<>|]/g, '-') // Replace illegal OS chars with hyphen
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/^[\s.-]+|[\s.-]+$/g, '') // Trim leading/trailing hyphens or dots
      .trim();

    if (!sanitized) {
      return item;
    }

    // Ensure uniqueness for identical titles in large batches
    const baseLower = sanitized.toLowerCase();
    const existingCount = usedNames.get(baseLower) || 0;
    usedNames.set(baseLower, existingCount + 1);

    if (existingCount > 0) {
      sanitized = `${sanitized}_${existingCount}`;
    }

    // Preserve exact original file extension (.jpeg, .jpg, .png, .webp, .svg, .eps, .mp4, .mov, etc.)
    const extMatch =
      (item.originalName || '').match(/\.[0-9a-z0-9]+$/i) ||
      (item.filePath || '').match(/\.[0-9a-z0-9]+$/i);
    const ext = extMatch
      ? extMatch[0]
      : item.fileType === 'svg'
      ? '.svg'
      : item.fileType === 'eps'
      ? '.eps'
      : item.fileType === 'video'
      ? '.mp4'
      : '.jpg';

    const newOriginalName = sanitized.endsWith(ext) ? sanitized : `${sanitized}${ext}`;

    count++;
    return {
      ...item,
      filename: sanitized,
      originalName: newOriginalName
    };
  });

  return { items: updatedItems, count };
}
