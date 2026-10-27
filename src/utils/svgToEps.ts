/**
 * SVG to EPS 10 Conversion & Adobe Illustrator Metadata Injection Utility
 * Formats EPS conformant to Adobe Document Structuring Conventions (DSC 3.0)
 * and Adobe XMP (Extensible Metadata Platform) for Encapsulated PostScript.
 */

export interface VectorMetadata {
  title: string;
  keywords: string;
  description: string;
  category?: string;
  rating?: number;
}

/**
 * Escapes PostScript string literals enclosed in parentheses: (string)
 */
function psEscape(str: string | undefined | null): string {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Escapes XML strings for XMP metadata packet
 */
function xmlEscape(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates Adobe XMP packet specifically tailored for Adobe Illustrator EPS 10 & JPEG
 */
export function generateAdobeXmpPacket(metadata: VectorMetadata): string {
  const keywordsList = (metadata.keywords || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  const keywordsXml = keywordsList
    .map(k => `            <rdf:li>${xmlEscape(k)}</rdf:li>`)
    .join('\n');

  const creationDate = new Date().toISOString();
  const categoryXml = metadata.category
    ? `         <photoshop:Category>${xmlEscape(metadata.category)}</photoshop:Category>\n`
    : '';

  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.1-c000 1.000000, 2023/11/01-00:00:00        ">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about=""
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
            xmlns:xmp="http://ns.adobe.com/xap/1.0/"
            xmlns:illustrator="http://ns.adobe.com/illustrator/1.0/"
            xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/">
         <dc:format>application/postscript</dc:format>
         <dc:title>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">${xmlEscape(metadata.title)}</rdf:li>
            </rdf:Alt>
         </dc:title>
         <dc:description>
            <rdf:Alt>
               <rdf:li xml:lang="x-default">${xmlEscape(metadata.description || metadata.title)}</rdf:li>
            </rdf:Alt>
         </dc:description>
         <dc:subject>
            <rdf:Bag>
${keywordsXml}
            </rdf:Bag>
         </dc:subject>
${categoryXml}         <xmp:CreateDate>${creationDate}</xmp:CreateDate>
         <xmp:ModifyDate>${creationDate}</xmp:ModifyDate>
         <xmp:Rating>${metadata.rating ?? 5}</xmp:Rating>
         <illustrator:StartupProfile>Print</illustrator:StartupProfile>
      </rdf:Description>
   </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Comments out every line of an XMP packet with '% ' so that PostScript
 * interpreters treat it as comment data instead of crashing on '<' tokens.
 */
export function formatEpsXmpCommentBlock(xmpString: string): string {
  return xmpString
    .split('\n')
    .map(line => (line.startsWith('%') ? line : `% ${line}`))
    .join('\n');
}

/**
 * Parses CSS / SVG color string (#rgb, #rrggbb, rgb(), named colors) to [r, g, b] (0..1)
 */
function parseSvgColor(colStr: string | undefined | null): [number, number, number] | null {
  if (!colStr) return null;
  const s = colStr.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;

  if (s.startsWith('#')) {
    const hex = s.substring(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))];
    }
  }

  const rgbMatch = s.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgbMatch) {
    const r = Math.min(255, parseFloat(rgbMatch[1])) / 255;
    const g = Math.min(255, parseFloat(rgbMatch[2])) / 255;
    const b = Math.min(255, parseFloat(rgbMatch[3])) / 255;
    return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))];
  }

  const namedColors: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [1, 1, 1],
    red: [1, 0, 0],
    green: [0, 0.5, 0],
    blue: [0, 0, 1],
    gray: [0.5, 0.5, 0.5],
    grey: [0.5, 0.5, 0.5],
    yellow: [1, 1, 0],
    cyan: [0, 1, 1],
    magenta: [1, 0, 1],
    orange: [1, 0.647, 0]
  };

  return namedColors[s] || null;
}

/**
 * Converts SVG path 'd' attribute string into PostScript vector path instructions
 */
function svgPathToPostScript(d: string): string {
  if (!d) return '';
  const tokens = d.match(/([a-df-z]|[-+]?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)/gi);
  if (!tokens) return '';

  const ps: string[] = [];
  let i = 0;
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let lastCmd = '';

  const nextNum = (): number => {
    if (i < tokens.length && /^[-+]?[0-9]/.test(tokens[i])) {
      return parseFloat(tokens[i++]);
    }
    return 0;
  };

  while (i < tokens.length) {
    let tok = tokens[i];
    if (/^[a-df-z]$/i.test(tok)) {
      lastCmd = tok;
      i++;
    }

    const cmd = lastCmd;
    const isRel = cmd === cmd.toLowerCase();

    if (cmd.toUpperCase() === 'M') {
      const x = isRel ? curX + nextNum() : nextNum();
      const y = isRel ? curY + nextNum() : nextNum();
      curX = x;
      curY = y;
      startX = x;
      startY = y;
      ps.push(`${x.toFixed(2)} ${y.toFixed(2)} m`);
      // Subsequent coordinate pairs after M are treated as Lineto
      lastCmd = isRel ? 'l' : 'L';
    } else if (cmd.toUpperCase() === 'L') {
      const x = isRel ? curX + nextNum() : nextNum();
      const y = isRel ? curY + nextNum() : nextNum();
      curX = x;
      curY = y;
      ps.push(`${x.toFixed(2)} ${y.toFixed(2)} l`);
    } else if (cmd.toUpperCase() === 'H') {
      const x = isRel ? curX + nextNum() : nextNum();
      curX = x;
      ps.push(`${x.toFixed(2)} ${curY.toFixed(2)} l`);
    } else if (cmd.toUpperCase() === 'V') {
      const y = isRel ? curY + nextNum() : nextNum();
      curY = y;
      ps.push(`${curX.toFixed(2)} ${y.toFixed(2)} l`);
    } else if (cmd.toUpperCase() === 'C') {
      const x1 = isRel ? curX + nextNum() : nextNum();
      const y1 = isRel ? curY + nextNum() : nextNum();
      const x2 = isRel ? curX + nextNum() : nextNum();
      const y2 = isRel ? curY + nextNum() : nextNum();
      const x = isRel ? curX + nextNum() : nextNum();
      const y = isRel ? curY + nextNum() : nextNum();
      curX = x;
      curY = y;
      ps.push(`${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} c`);
    } else if (cmd.toUpperCase() === 'S') {
      const x2 = isRel ? curX + nextNum() : nextNum();
      const y2 = isRel ? curY + nextNum() : nextNum();
      const x = isRel ? curX + nextNum() : nextNum();
      const y = isRel ? curY + nextNum() : nextNum();
      const x1 = curX;
      const y1 = curY;
      curX = x;
      curY = y;
      ps.push(`${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} c`);
    } else if (cmd.toUpperCase() === 'Q') {
      const qx = isRel ? curX + nextNum() : nextNum();
      const qy = isRel ? curY + nextNum() : nextNum();
      const x = isRel ? curX + nextNum() : nextNum();
      const y = isRel ? curY + nextNum() : nextNum();
      // Quadratic to Cubic Bezier
      const cx1 = curX + (2 / 3) * (qx - curX);
      const cy1 = curY + (2 / 3) * (qy - curY);
      const cx2 = x + (2 / 3) * (qx - x);
      const cy2 = y + (2 / 3) * (qy - y);
      curX = x;
      curY = y;
      ps.push(`${cx1.toFixed(2)} ${cy1.toFixed(2)} ${cx2.toFixed(2)} ${cy2.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} c`);
    } else if (cmd.toUpperCase() === 'Z') {
      ps.push('cp');
      curX = startX;
      curY = startY;
    } else {
      // Advance past unknown commands/arguments to avoid infinite loops
      i++;
    }
  }

  return ps.join('\n');
}

/**
 * Extracts and translates common SVG vector elements into PostScript rendering stream
 */
function translateSvgElementsToPostScript(svgString: string, w: number, h: number): string {
  const psStream: string[] = [];

  // 1. Initial crisp white background canvas matching Artboard
  psStream.push(`gs\n1 1 1 rgb\n0 0 m ${w} 0 l ${w} ${h} l 0 ${h} l cp f\ngr`);

  // Helper to extract attributes from XML tags
  const getAttr = (tag: string, name: string): string => {
    const m = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'));
    return m ? m[1].trim() : '';
  };

  const getStyleAttr = (tag: string, name: string): string => {
    const style = getAttr(tag, 'style');
    if (style) {
      const sm = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'));
      if (sm) return sm[1].trim();
    }
    return getAttr(tag, name);
  };

  let renderedElementCount = 0;

  // 2. Parse SVG tags
  const tagRegex = /<(path|rect|circle|ellipse|polygon|polyline|line)\b([^>]*)(\/?>)/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(svgString)) !== null) {
    const type = match[1].toLowerCase();
    const attrs = match[2];

    const rawFill = getStyleAttr(attrs, 'fill') || '#000000';
    const rawStroke = getStyleAttr(attrs, 'stroke');
    const rawStrokeWidth = parseFloat(getStyleAttr(attrs, 'stroke-width') || '1') || 1;
    const fillRule = getStyleAttr(attrs, 'fill-rule');

    const fillColor = parseSvgColor(rawFill);
    const strokeColor = parseSvgColor(rawStroke);

    let pathCommands = '';

    if (type === 'path') {
      const d = getAttr(attrs, 'd');
      if (d) pathCommands = svgPathToPostScript(d);
    } else if (type === 'rect') {
      const rx = parseFloat(getAttr(attrs, 'x') || '0') || 0;
      const ry = parseFloat(getAttr(attrs, 'y') || '0') || 0;
      const rw = parseFloat(getAttr(attrs, 'width') || '0') || 0;
      const rh = parseFloat(getAttr(attrs, 'height') || '0') || 0;
      if (rw > 0 && rh > 0) {
        pathCommands = `${rx.toFixed(2)} ${ry.toFixed(2)} m ${(rx + rw).toFixed(2)} ${ry.toFixed(2)} l ${(rx + rw).toFixed(2)} ${(ry + rh).toFixed(2)} l ${rx.toFixed(2)} ${(ry + rh).toFixed(2)} l cp`;
      }
    } else if (type === 'circle') {
      const cx = parseFloat(getAttr(attrs, 'cx') || '0') || 0;
      const cy = parseFloat(getAttr(attrs, 'cy') || '0') || 0;
      const r = parseFloat(getAttr(attrs, 'r') || '0') || 0;
      if (r > 0) {
        // Approximate circle using 4 cubic bezier segments (factor k = 0.55228475)
        const k = r * 0.55228475;
        pathCommands = [
          `${(cx).toFixed(2)} ${(cy - r).toFixed(2)} m`,
          `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy).toFixed(2)} c`,
          `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx).toFixed(2)} ${(cy + r).toFixed(2)} c`,
          `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy).toFixed(2)} c`,
          `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx).toFixed(2)} ${(cy - r).toFixed(2)} c`,
          `cp`
        ].join('\n');
      }
    } else if (type === 'polygon' || type === 'polyline') {
      const pointsStr = getAttr(attrs, 'points');
      if (pointsStr) {
        const coords = pointsStr.trim().split(/[\s,]+/).map(Number);
        if (coords.length >= 4) {
          const cmds = [`${coords[0].toFixed(2)} ${coords[1].toFixed(2)} m`];
          for (let p = 2; p < coords.length - 1; p += 2) {
            cmds.push(`${coords[p].toFixed(2)} ${coords[p + 1].toFixed(2)} l`);
          }
          if (type === 'polygon') cmds.push('cp');
          pathCommands = cmds.join('\n');
        }
      }
    } else if (type === 'line') {
      const x1 = parseFloat(getAttr(attrs, 'x1') || '0') || 0;
      const y1 = parseFloat(getAttr(attrs, 'y1') || '0') || 0;
      const x2 = parseFloat(getAttr(attrs, 'x2') || '0') || 0;
      const y2 = parseFloat(getAttr(attrs, 'y2') || '0') || 0;
      pathCommands = `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l`;
    }

    if (pathCommands) {
      renderedElementCount++;
      const fillOp = fillRule === 'evenodd' ? 'eof' : 'f';
      const block: string[] = ['gs', pathCommands];

      if (fillColor && strokeColor) {
        block.push('gs');
        block.push(`${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rgb`);
        block.push(fillOp);
        block.push('gr');
        block.push(`${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} rgb`);
        block.push(`${rawStrokeWidth.toFixed(2)} slw`);
        block.push('s');
      } else if (fillColor) {
        block.push(`${fillColor[0]} ${fillColor[1]} ${fillColor[2]} rgb`);
        block.push(fillOp);
      } else if (strokeColor) {
        block.push(`${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} rgb`);
        block.push(`${rawStrokeWidth.toFixed(2)} slw`);
        block.push('s');
      } else {
        // Default black fill if unspecified
        block.push('0 0 0 rgb');
        block.push(fillOp);
      }

      block.push('gr');
      psStream.push(block.join('\n'));
    }
  }

  // If no parseable elements were extracted, provide a valid, safe vector placeholder
  if (renderedElementCount === 0) {
    psStream.push(`gs\n0.2 0.3 0.4 rgb\n2 slw\n${(w * 0.1).toFixed(2)} ${(h * 0.1).toFixed(2)} m ${(w * 0.9).toFixed(2)} ${(h * 0.1).toFixed(2)} l ${(w * 0.9).toFixed(2)} ${(h * 0.9).toFixed(2)} l ${(w * 0.1).toFixed(2)} ${(h * 0.9).toFixed(2)} l cp\ns\ngr`);
  }

  return psStream.join('\n\n');
}

/**
 * Converts an SVG file content into PostScript EPS 10 with injected
 * Adobe Document Structuring Conventions (DSC) & Commented XMP metadata.
 */
export function convertSvgToEps10(
  svgString: string,
  metadata: VectorMetadata,
  width: number = 800,
  height: number = 800
): string {
  // Extract dimensions from SVG if available
  const widthMatch = svgString.match(/width=["']([0-9.]+)(px)?["']/i);
  const heightMatch = svgString.match(/height=["']([0-9.]+)(px)?["']/i);
  const viewBoxMatch = svgString.match(/viewBox=["']([0-9.\s,-]+)["']/i);

  let w = width;
  let h = height;

  if (viewBoxMatch && viewBoxMatch[1]) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = Math.round(parts[2]);
      h = Math.round(parts[3]);
    }
  } else if (widthMatch && heightMatch) {
    const parsedW = parseFloat(widthMatch[1]);
    const parsedH = parseFloat(heightMatch[1]);
    if (!isNaN(parsedW) && !isNaN(parsedH) && parsedW > 0 && parsedH > 0) {
      w = Math.round(parsedW);
      h = Math.round(parsedH);
    }
  }

  const creationDate = new Date().toUTCString();
  const rawXmpPacket = generateAdobeXmpPacket(metadata);
  const commentedXmp = formatEpsXmpCommentBlock(rawXmpPacket);
  const vectorStream = translateSvgElementsToPostScript(svgString, w, h);

  // Generate valid PostScript Level 2 / EPS 10 structure with DSC comments
  return `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${w} ${h}
%%HiResBoundingBox: 0.0000 0.0000 ${w}.0000 ${h}.0000
%%Title: ${psEscape(metadata.title)}
%%CreationDate: ${creationDate}
%%Keywords: ${psEscape(metadata.keywords)}
%%Subject: ${psEscape(metadata.description || metadata.title)}
%%Category: ${psEscape(metadata.category || 'Arts, Vector')}
%%Rating: ${metadata.rating ?? 5}
%%For: Microstock Contributor
%%Pages: 1
%%DocumentData: Clean7Bit
%%LanguageLevel: 2
%%Orientation: Portrait
%%EndComments
%%BeginDefaults
%%ViewingOrientation: 1 0 0 1
%%EndDefaults
%%BeginProlog
/gs /gsave load def
/gr /grestore load def
/m /moveto load def
/l /lineto load def
/c /curveto load def
/cp /closepath load def
/s /stroke load def
/f /fill load def
/eof /eofill load def
/rgb { setrgbcolor } bind def
/slw { setlinewidth } bind def
%%EndProlog
%%BeginSetup
%%BeginDocument: Adobe_XMP_Metadata
${commentedXmp}
%%EndDocument
%%EndSetup
%%Page: 1 1
gs
% Coordinate origin translation for PostScript EPS matching SVG top-left origin
0 ${h} translate
1 -1 scale
% Clip to exact Artboard bounds
0 0 m ${w} 0 l ${w} ${h} l 0 ${h} l cp clip newpath

${vectorStream}

gr
%%PageTrailer
%%Trailer
%%EOF
`;
}

/**
 * Injects or updates metadata DSC headers and XMP in an existing EPS string
 */
export function injectMetadataIntoEps(existingEps: string, metadata: VectorMetadata): string {
  const rawXmpPacket = generateAdobeXmpPacket(metadata);
  const commentedXmp = formatEpsXmpCommentBlock(rawXmpPacket);

  // If already an EPS, preserve body and replace or inject DSC headers
  let cleanEps = existingEps;

  // Remove old Title, Keywords, Subject comments if any
  cleanEps = cleanEps.replace(/^%%Title:.*$/m, `%%Title: ${psEscape(metadata.title)}`);
  cleanEps = cleanEps.replace(/^%%Keywords:.*$/m, `%%Keywords: ${psEscape(metadata.keywords)}`);
  cleanEps = cleanEps.replace(/^%%Subject:.*$/m, `%%Subject: ${psEscape(metadata.description)}`);
  cleanEps = cleanEps.replace(/^%%Category:.*$/m, `%%Category: ${psEscape(metadata.category || 'Arts, Vector')}`);
  cleanEps = cleanEps.replace(/^%%Rating:.*$/m, `%%Rating: ${metadata.rating ?? 5}`);
  cleanEps = cleanEps.replace(/^%%Creator:.*$/m, '');

  if (!cleanEps.includes('%%Title:')) {
    cleanEps = cleanEps.replace(
      /(%!PS-Adobe[^\n]*\n)/,
      `$1%%Title: ${psEscape(metadata.title)}\n%%Keywords: ${psEscape(metadata.keywords)}\n%%Subject: ${psEscape(metadata.description)}\n%%Category: ${psEscape(metadata.category || 'Arts, Vector')}\n%%Rating: ${metadata.rating ?? 5}\n`
    );
  }

  // Inject or update XMP block (always commented with % so PostScript interpreters do not crash)
  if (cleanEps.includes('%%BeginDocument: Adobe_XMP_Metadata')) {
    cleanEps = cleanEps.replace(
      /%%BeginDocument: Adobe_XMP_Metadata[\s\S]*?%%EndDocument/,
      `%%BeginDocument: Adobe_XMP_Metadata\n${commentedXmp}\n%%EndDocument`
    );
  } else {
    if (cleanEps.includes('%%EndComments')) {
      cleanEps = cleanEps.replace(
        '%%EndComments',
        `%%EndComments\n%%BeginSetup\n%%BeginDocument: Adobe_XMP_Metadata\n${commentedXmp}\n%%EndDocument\n%%EndSetup`
      );
    }
  }

  return cleanEps;
}
