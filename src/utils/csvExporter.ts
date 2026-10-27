import { MetadataItem } from '../types';

export type MarketplacePreset =
  | 'All Marketplace'
  | 'Adobe Stock'
  | 'Shutterstock'
  | 'Freepik'
  | 'Vecteezy'
  | 'Etsy';

function escapeCsvCell(cell: string | number | undefined): string {
  if (cell === undefined || cell === null) return '""';
  const str = String(cell);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function exportMetadataToCsv(items: MetadataItem[], preset: MarketplacePreset): string {
  const validItems = items.filter(i => i.status === 'processed');

  if (preset === 'Adobe Stock') {
    // Adobe Stock format: Filename, Title, Keywords, Category
    const headers = ['Filename', 'Title', 'Keywords', 'Category'];
    const rows = validItems.map(item => [
      escapeCsvCell(item.originalName || item.filename),
      escapeCsvCell(item.title),
      escapeCsvCell(item.keywords),
      escapeCsvCell(item.category)
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  if (preset === 'Shutterstock') {
    // Shutterstock format: Filename, Description, Keywords, Categories, Editorial
    const headers = ['Filename', 'Description', 'Keywords', 'Categories', 'Illustration', 'Editorial'];
    const rows = validItems.map(item => [
      escapeCsvCell(item.originalName || item.filename),
      escapeCsvCell(item.description || item.title),
      escapeCsvCell(item.keywords),
      escapeCsvCell(item.category),
      escapeCsvCell('yes'),
      escapeCsvCell('no')
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  if (preset === 'Freepik') {
    // Freepik format: File, Title, Tags
    const headers = ['File', 'Title', 'Tags'];
    const rows = validItems.map(item => [
      escapeCsvCell(item.originalName || item.filename),
      escapeCsvCell(item.title),
      escapeCsvCell(item.keywords)
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  if (preset === 'Vecteezy') {
    // Vecteezy format: Filename, Title, Description, Keywords, License
    const headers = ['Filename', 'Title', 'Description', 'Keywords', 'License'];
    const rows = validItems.map(item => [
      escapeCsvCell(item.originalName || item.filename),
      escapeCsvCell(item.title),
      escapeCsvCell(item.description || item.title),
      escapeCsvCell(item.keywords),
      escapeCsvCell('Standard')
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  if (preset === 'Etsy') {
    const headers = ['Title', 'Description', 'Tags', 'Category', 'Price', 'Quantity'];
    const rows = validItems.map(item => [
      escapeCsvCell(item.title),
      escapeCsvCell(item.description),
      escapeCsvCell(item.keywords.split(',').slice(0, 13).join(',')),
      escapeCsvCell(item.category),
      escapeCsvCell('4.99'),
      escapeCsvCell('999')
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  }

  // All Marketplace Universal format
  const headers = ['Filename', 'Original Name', 'Title', 'Keywords', 'Description', 'Category', 'Rating', 'Status', 'Embedded'];
  const rows = items.map(item => [
    escapeCsvCell(item.filename),
    escapeCsvCell(item.originalName),
    escapeCsvCell(item.title),
    escapeCsvCell(item.keywords),
    escapeCsvCell(item.description),
    escapeCsvCell(item.category),
    escapeCsvCell(item.rating),
    escapeCsvCell(item.status),
    escapeCsvCell(item.isEmbedded ? 'Yes' : 'No')
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

export function downloadCsvFile(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
