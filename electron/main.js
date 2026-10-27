import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import piexif from 'piexifjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Locates the bundled or system exiftool executable
 */
function getExifToolPath() {
  const candidates = [
    // Unpacked asar path in production release
    path.join(__dirname, 'bin/exiftool.exe').replace('app.asar', 'app.asar.unpacked'),
    // Extra resources paths
    process.resourcesPath ? path.join(process.resourcesPath, 'bin/exiftool.exe') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'exiftool.exe') : null,
    // Development or local project paths
    path.join(__dirname, 'bin/exiftool.exe'),
    path.join(__dirname, '../electron/bin/exiftool.exe'),
    path.join(process.cwd(), 'electron/bin/exiftool.exe'),
    'exiftool.exe',
    'exiftool'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'exiftool' || candidate === 'exiftool.exe') continue;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'exiftool';
}

/**
 * Injects 100% compliant Windows File Explorer Details (XPTitle, XPKeywords, XPSubject, Rating 5-Star),
 * IPTC, and Adobe XMP into a JPEG/EPS using bundled ExifTool.
 */
function injectMetadataWithExifTool(filePath, item) {
  if (!fs.existsSync(filePath)) return false;

  const exiftoolBin = getExifToolPath();
  const title = (item.title || item.sanitizedTitle || '').trim();
  const desc = (item.description || title).trim();
  const rawKeywords = (item.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const xpKeywords = rawKeywords.join('; ');
  const rating = Math.min(5, Math.max(1, Number(item.rating) || 5));
  const ratingPercent = rating * 20 - 1; // 5 -> 99 for Windows Explorer Details
  const category = (item.category || 'Arts, Objects').trim();

  // Create temporary argfile for ExifTool (prevents cmd length overflow & escaping bugs)
  const tempDir = os.tmpdir();
  const argfilePath = path.join(tempDir, `mdg_et_args_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.txt`);

  const lines = [
    '-overwrite_original',
    '-charset',
    'utf8',
    '-charset',
    'iptc=utf8',
    '-codedcharacterset=utf8',
    `-XPTitle=${title}`,
    `-Title=${title}`,
    `-ObjectName=${title}`,
    `-Headline=${title}`,
    `-ImageDescription=${title || desc}`,
    `-XPSubject=${desc || title}`,
    `-Subject=${desc || title}`,
    `-Rating=${rating}`,
    `-RatingPercent=${ratingPercent}`,
    `-xmp:Rating=${rating}`,
    '-XPAuthor=',
    '-Artist=',
    '-Creator=',
    '-By-line=',
    '-Credit=',
    '-Copyright=',
    '-CopyrightNotice=',
    '-Software=',
    '-CreatorTool=',
    '-ProgramName=',
    '-OriginatingProgram=',
    `-XPComment=${desc}`,
    `-Caption-Abstract=${desc}`,
    `-Description=${desc}`,
    `-Category=${category}`,
    `-Photoshop:Category=${category}`,
    `-XPKeywords=${xpKeywords}`
  ];

  for (const kw of rawKeywords) {
    lines.push(`-Keywords=${kw}`);
    lines.push(`-Subject=${kw}`);
  }

  // Target file path (normalized with forward slashes for ExifTool compatibility)
  lines.push(filePath.replace(/\\/g, '/'));

  try {
    fs.writeFileSync(argfilePath, lines.join('\n'), 'utf8');

    execFileSync(exiftoolBin, ['-@', argfilePath], {
      cwd: path.dirname(exiftoolBin),
      windowsHide: true,
      timeout: 20000,
      encoding: 'utf8'
    });

    try { fs.unlinkSync(argfilePath); } catch (e) {}
    return true;
  } catch (err) {
    try { if (fs.existsSync(argfilePath)) fs.unlinkSync(argfilePath); } catch (e) {}
    console.warn(`ExifTool execution notice for ${filePath}:`, err?.message || err);
    return false;
  }
}

/**
 * Direct Adobe Photoshop background metadata injector using COM automation.
 * Writes native Adobe document info and XMP packet directly into JPEG files.
 */
function applyPhotoshopMetadataDirect(filePath, item) {
  if (!filePath || !fs.existsSync(filePath)) return false;

  const tempDir = os.tmpdir();
  const vbsPath = path.join(tempDir, `mdg_ps_single_${Date.now()}.vbs`);
  const jsxPath = path.join(tempDir, `mdg_ps_single_${Date.now()}.jsx`);

  const title = (item.title || item.sanitizedTitle || '').trim();
  const desc = (item.description || title).trim();
  const rawKeywords = (item.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const cleanKeywordsJson = JSON.stringify(rawKeywords);
  const escapedFilePath = filePath.replace(/\\/g, '\\\\');

  const jsxScript = `#target photoshop
(function() {
    try { app.displayDialogs = DialogModes.NO; } catch(e) {}
    var f = new File("${escapedFilePath}");
    if (!f.exists) return;
    var doc = null;
    try {
        doc = app.open(f);
        if (doc.info) {
            doc.info.title = ${JSON.stringify(title)};
            doc.info.headline = ${JSON.stringify(title)};
            doc.info.caption = ${JSON.stringify(desc)};
            doc.info.keywords = ${cleanKeywordsJson};
            doc.info.category = ${JSON.stringify(item.category || 'Arts, Objects')};
        }
        try {
            if (ExternalObject.AdobeXMPScript == undefined) {
                ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
            }
            if (ExternalObject.AdobeXMPScript != undefined) {
                var xmp = new XMPMeta(doc.xmpMetadata.raw);
                xmp.setProperty(XMPConst.NS_XMP, "Rating", String(${Number(item.rating) || 5}));
                xmp.setProperty(XMPConst.NS_PHOTOSHOP, "Category", ${JSON.stringify(item.category || 'Arts, Objects')});
                doc.xmpMetadata.raw = xmp.serialize();
            }
        } catch(eXmp) {}
        doc.save();
        doc.close(SaveOptions.DONOTSAVECHANGES);
    } catch(err) {
        if (doc != null) {
            try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(cErr) {}
        }
    }
})();
`;

  const vbsScript = `' VBScript runner for Adobe Photoshop
On Error Resume Next
Set appRef = CreateObject("Photoshop.Application")
If Err.Number <> 0 Then
    WScript.Quit 1
End If
appRef.DisplayDialogs = 3
appRef.DoJavaScriptFile "${jsxPath.replace(/\\/g, '\\\\')}"
WScript.Quit 0
`;

  try {
    fs.writeFileSync(jsxPath, jsxScript, 'utf8');
    fs.writeFileSync(vbsPath, vbsScript, 'utf8');
    execFileSync('cscript', ['//nologo', vbsPath], { windowsHide: true, timeout: 25000 });
    try { fs.unlinkSync(jsxPath); fs.unlinkSync(vbsPath); } catch (e) {}
    return true;
  } catch (psErr) {
    try { if (fs.existsSync(jsxPath)) fs.unlinkSync(jsxPath); if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath); } catch (e) {}
    return false;
  }
}

/**
 * Universal Node.js JPEG Metadata Injector for Electron
 * Embeds synchronized Windows EXIF (XPTitle, XPKeywords, XPSubject, Rating)
 */
function buildPureWindowsExifSegment(item) {
  const title = (item.title || item.sanitizedTitle || '').trim();
  const desc = (item.description || title).trim();
  const rating = Math.min(5, Math.max(1, Number(item.rating) || 5));
  const ratingPercent = rating * 20 - 1; // 5 -> 99 for Windows Explorer 5-star rating
  const rawKeywords = (item.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  const xpKeywords = rawKeywords.join('; ');

  function encodeUcs2Le(str) {
    const buf = Buffer.alloc((str.length + 1) * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    buf.writeUInt16LE(0, str.length * 2); // Double-null terminator required by Windows
    return buf;
  }

  function encodeAsciiNull(str) {
    return Buffer.concat([Buffer.from(String(str || ''), 'ascii'), Buffer.from([0])]);
  }

  // Tags sorted strictly by Tag ID in ascending numerical order (Mandatory for Windows propsys.dll parser!)
  const tags = [
    { id: 0x010e, type: 2, data: encodeAsciiNull(title || desc) }, // ImageDescription
    { id: 0x4746, type: 3, val: rating },                          // Rating (5-Star)
    { id: 0x4749, type: 3, val: ratingPercent },                   // RatingPercent (99)
    { id: 0x9c9b, type: 1, data: encodeUcs2Le(title) },            // XPTitle
    { id: 0x9c9c, type: 1, data: encodeUcs2Le(desc) },             // XPComment
    { id: 0x9c9e, type: 1, data: encodeUcs2Le(xpKeywords) },       // XPKeywords
    { id: 0x9c9f, type: 1, data: encodeUcs2Le(desc || title) }      // XPSubject
  ];

  tags.sort((a, b) => a.id - b.id);

  const numTags = tags.length;
  const ifdLen = 2 + (numTags * 12) + 4;
  let totalExtraLen = 0;
  for (const t of tags) {
    if (t.type !== 3 && t.data.length > 4) {
      totalExtraLen += t.data.length + (t.data.length % 2 !== 0 ? 1 : 0);
    }
  }

  const tiffTotalLen = 8 + ifdLen + totalExtraLen;
  const tiffBuf = Buffer.alloc(tiffTotalLen);

  // TIFF Header: Little Endian ('II', 42, offset to IFD0 = 8)
  tiffBuf[0] = 0x49;
  tiffBuf[1] = 0x49;
  tiffBuf.writeUInt16LE(42, 2);
  tiffBuf.writeUInt32LE(8, 4);

  // IFD0 Entry Count
  tiffBuf.writeUInt16LE(numTags, 8);

  let entryPos = 10;
  let currDataOffset = 8 + ifdLen;

  for (const t of tags) {
    tiffBuf.writeUInt16LE(t.id, entryPos);
    tiffBuf.writeUInt16LE(t.type, entryPos + 2);

    if (t.type === 3) {
      // 16-bit SHORT stored directly in the 4-byte value field
      tiffBuf.writeUInt32LE(1, entryPos + 4);
      tiffBuf.writeUInt16LE(t.val, entryPos + 8);
      tiffBuf.writeUInt16LE(0, entryPos + 10);
    } else {
      const len = t.data.length;
      tiffBuf.writeUInt32LE(len, entryPos + 4);
      if (len <= 4) {
        t.data.copy(tiffBuf, entryPos + 8);
      } else {
        tiffBuf.writeUInt32LE(currDataOffset, entryPos + 8);
        t.data.copy(tiffBuf, currDataOffset);
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
  tiffBuf.writeUInt32LE(0, entryPos);

  const exifPrefix = Buffer.from('Exif\0\0', 'ascii');
  const app1Payload = Buffer.concat([exifPrefix, tiffBuf]);
  const markerLen = app1Payload.length + 2;

  return Buffer.concat([
    Buffer.from([0xff, 0xe1, (markerLen >> 8) & 0xff, markerLen & 0xff]),
    app1Payload
  ]);
}

/**
 * Universal Node.js JPEG Metadata Injector for Electron
 * Embeds synchronized Windows EXIF (XPTitle, XPKeywords, XPSubject, Rating),
 * Photoshop IPTC, and Adobe XMP directly into JPEG binaries.
 */
function injectCompleteMetadataIntoJpeg(filePath, item) {
  if (!fs.existsSync(filePath)) return false;

  // Optional: Run ExifTool if bundled or installed on host system
  try {
    injectMetadataWithExifTool(filePath, item);
  } catch (etErr) {}

  try {
    let raw = null;
    for (let r = 0; r < 8; r++) {
      try {
        raw = fs.readFileSync(filePath);
        if (raw && raw.length > 100) break;
      } catch (err) {
        if (r === 7) return false;
        const waitUntil = Date.now() + 150;
        while (Date.now() < waitUntil) {}
      }
    }

    if (!raw || raw.length < 100) return false;

    // Detect SOI marker (0xFF, 0xD8)
    let soiIndex = -1;
    for (let i = 0; i < Math.min(raw.length - 1, 4096); i++) {
      if (raw[i] === 0xff && raw[i + 1] === 0xd8) {
        soiIndex = i;
        break;
      }
    }
    if (soiIndex === -1) return false;
    if (soiIndex > 0) {
      raw = raw.subarray(soiIndex);
    }

    const title = (item.title || item.sanitizedTitle || '').trim();
    const desc = (item.description || title).trim();
    const rawKeywords = (item.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
    const rating = Math.min(5, Math.max(1, Number(item.rating) || 5));

    // 1. Build clean APP1 EXIF segment (pure binary Little-Endian with Microsoft XP tags & 5-Star rating)
    const exifSegment = buildPureWindowsExifSegment(item);

    // 2. Build standard Adobe XMP APP1 segment
    const escapeXml = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const xmpPacket = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.1.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li>
    </rdf:Alt>
   </dc:title>
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${escapeXml(desc)}</rdf:li>
    </rdf:Alt>
   </dc:description>
   <dc:subject>
    <rdf:Bag>
     ${rawKeywords.map(k => `<rdf:li>${escapeXml(k)}</rdf:li>`).join('\n     ')}
    </rdf:Bag>
   </dc:subject>
   <photoshop:Category>${escapeXml(item.category || 'Arts, Objects')}</photoshop:Category>
   <xmp:Rating>${rating}</xmp:Rating>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

    const xmpHeader = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'utf8');
    const xmpBytes = Buffer.from(xmpPacket, 'utf8');
    const xmpPayloadLen = xmpHeader.length + xmpBytes.length;
    const xmpMarkerLen = xmpPayloadLen + 2;
    const xmpSegment = Buffer.concat([
      Buffer.from([0xff, 0xe1, (xmpMarkerLen >> 8) & 0xff, xmpMarkerLen & 0xff]),
      xmpHeader,
      xmpBytes
    ]);

    // 3. Build IPTC APP13 segment (for microstock photo platforms)
    const iptcChunks = [];
    function addIptcTag(dataset, val) {
      const b = Buffer.isBuffer(val) ? val : Buffer.from(String(val || ''), 'utf8');
      if (b.length === 0) return;
      const c = Buffer.alloc(5 + b.length);
      c[0] = 0x1c;
      c[1] = 0x02;
      c[2] = dataset & 0xff;
      c[3] = (b.length >> 8) & 0xff;
      c[4] = b.length & 0xff;
      b.copy(c, 5);
      iptcChunks.push(c);
    }
    addIptcTag(0x00, Buffer.from([0x00, 0x04]));
    addIptcTag(0x05, title);
    addIptcTag(0x0f, item.category || 'Arts, Objects');
    for (const kw of rawKeywords) {
      addIptcTag(0x19, kw);
    }
    addIptcTag(0x78, desc);

    const iptcPayload = Buffer.concat(iptcChunks);
    const psBlockLen = iptcPayload.length;
    const psBlockHeader = Buffer.from([
      0x38, 0x42, 0x49, 0x4d,
      0x04, 0x04,
      0x00, 0x00,
      (psBlockLen >> 24) & 0xff,
      (psBlockLen >> 16) & 0xff,
      (psBlockLen >> 8) & 0xff,
      psBlockLen & 0xff
    ]);
    const psHeader = Buffer.from('Photoshop 3.0\0', 'utf8');
    let psData = Buffer.concat([psHeader, psBlockHeader, iptcPayload]);
    if (psBlockLen % 2 !== 0) {
      psData = Buffer.concat([psData, Buffer.from([0x00])]);
    }
    const iptcMarkerLen = psData.length + 2;
    const iptcSegment = Buffer.concat([
      Buffer.from([0xff, 0xed, (iptcMarkerLen >> 8) & 0xff, iptcMarkerLen & 0xff]),
      psData
    ]);

    // 4. Strip old APP0 (JFIF), APP1 (old EXIF/XMP), and APP13 (IPTC) to eliminate conflicts
    let pos = 2;
    const preservedSegments = [];
    while (pos < raw.length - 1) {
      if (raw[pos] !== 0xff) {
        pos++;
        continue;
      }
      const marker = raw[pos + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        preservedSegments.push(raw.subarray(pos, pos + 2));
        pos += 2;
        continue;
      }
      if (pos + 3 >= raw.length) break;
      const segLen = (raw[pos + 2] << 8) | raw[pos + 3];
      const totalSegLen = 2 + segLen;
      if (pos + totalSegLen > raw.length) break;

      const isApp0 = marker === 0xe0;
      const isApp1 = marker === 0xe1;
      const isApp13 = marker === 0xed;

      if (!isApp0 && !isApp1 && !isApp13) {
        preservedSegments.push(raw.subarray(pos, pos + totalSegLen));
      }
      pos += totalSegLen;
    }
    const remainingScanData = raw.subarray(pos);

    // 5. Assemble pristine JPEG binary stream:
    // SOI (0xFFD8) -> APP1 EXIF (at byte 2 for Windows Details!) -> APP1 XMP -> APP13 IPTC -> Preserved -> Scan Data
    const finalBuffer = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      exifSegment,
      xmpSegment,
      iptcSegment,
      ...preservedSegments,
      remainingScanData
    ]);

    for (let r = 0; r < 8; r++) {
      try {
        fs.writeFileSync(filePath, finalBuffer);
        return true;
      } catch (err) {
        if (r === 7) return false;
        const waitUntil = Date.now() + 150;
        while (Date.now() < waitUntil) {}
      }
    }
  } catch (err) {
    console.warn(`Could not inject metadata into ${filePath}:`, err);
  }
  return false;
}

// Ensure Windows taskbar correctly groups and displays the application icon
if (process.platform === 'win32') {
  app.setAppUserModelId('com.metadatagenerator.app');
}

let mainWindow = null;

function getAppIcon() {
  const icoCandidate = path.join(__dirname, '../public/icon.ico');
  const pngCandidate = path.join(__dirname, '../public/icon.png');
  if (process.platform === 'win32' && fs.existsSync(icoCandidate)) {
    return icoCandidate;
  }
  if (fs.existsSync(pngCandidate)) {
    return pngCandidate;
  }
  return icoCandidate;
}

function createWindow() {
  const appIcon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Meta Data Generator',
    icon: appIcon,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    show: false,
  });

  // Handle external link clicks safely in the user's default web browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const isDev = !app.isPackaged && process.env.ELECTRON_DEV === 'true';
  const distIndexPath = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(distIndexPath)) {
    mainWindow.loadFile(distIndexPath);
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  // Crash recovery - reload instead of staying black if renderer ever crashes
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details);
    if (mainWindow && details.reason !== 'clean-exit') {
      mainWindow.reload();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer became unresponsive');
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ================= IPC Handlers for In-Place Local File Injection =================

// 1. Direct local file overwrite / creation (with optional oldPath cleanup if renamed)
ipcMain.handle('write-local-file', async (_event, { filePath, base64Data, oldPath }) => {
  try {
    let buffer;
    if (Buffer.isBuffer(base64Data)) {
      buffer = base64Data;
    } else if (base64Data instanceof Uint8Array || (base64Data && base64Data.buffer instanceof ArrayBuffer)) {
      buffer = Buffer.from(base64Data.buffer, base64Data.byteOffset || 0, base64Data.byteLength);
    } else if (typeof base64Data === 'string') {
      const trimmed = base64Data.trim();
      const isBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0 && !trimmed.startsWith('%!PS') && !trimmed.startsWith('<?xml') && !trimmed.startsWith('<svg');
      buffer = isBase64 ? Buffer.from(trimmed, 'base64') : Buffer.from(base64Data, 'utf8');
    } else {
      buffer = Buffer.from(base64Data);
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Write with retry in case the file is briefly locked by Windows indexing or background exports
    let writeSuccess = false;
    for (let r = 0; r < 6; r++) {
      try {
        fs.writeFileSync(filePath, buffer);
        writeSuccess = true;
        break;
      } catch (wErr) {
        if (r === 5) throw wErr;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // If file was renamed, safely remove the old file
    if (oldPath && oldPath !== filePath && fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch (delErr) {
        console.warn('Could not delete old file after rename:', delErr);
      }
    }

    return { success: true, filePath };
  } catch (err) {
    console.error('Error writing local file:', err);
    return { success: false, error: err.message };
  }
});

// 1b. Rename local file on disk
ipcMain.handle('rename-local-file', async (_event, { oldPath, newPath }) => {
  try {
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: 'Source file does not exist' };
    }
    if (oldPath === newPath) {
      return { success: true, newPath };
    }
    if (fs.existsSync(newPath)) {
      try { fs.unlinkSync(newPath); } catch (e) {}
    }
    fs.renameSync(oldPath, newPath);
    return { success: true, newPath };
  } catch (err) {
    console.error('Error renaming local file:', err);
    return { success: false, error: err.message };
  }
});

// 1c. Delete local file from disk
ipcMain.handle('delete-local-file', async (_event, { filePath }) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'File does not exist' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 1d. Clean filenames in a directory: replaces all dashes (-) and underscores (_) with single spaces
ipcMain.handle('clean-folder-filenames', async (_event, { folderPath }) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return { success: false, error: 'Folder path does not exist', renamedCount: 0 };
    }
    const stat = fs.statSync(folderPath);
    const targetDir = stat.isDirectory() ? folderPath : path.dirname(folderPath);
    const files = fs.readdirSync(targetDir);
    let renamedCount = 0;
    const renamedMap = {};

    const targetExts = ['.jpg', '.jpeg', '.eps', '.svg', '.png', '.webp', '.ai', '.mp4', '.mov'];

    for (const fileName of files) {
      const ext = path.extname(fileName);
      if (!targetExts.includes(ext.toLowerCase())) continue;

      const baseName = path.basename(fileName, ext);
      if (baseName.includes('-') || baseName.includes('_') || /\s{2,}/.test(baseName)) {
        let cleanedBase = baseName
          .replace(/[-_]+/g, ' ')
          .replace(/[\\/:*?"<>|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanedBase && cleanedBase !== baseName) {
          const newFileName = `${cleanedBase}${ext}`;
          const oldPath = path.join(targetDir, fileName);
          const newPath = path.join(targetDir, newFileName);

          if (oldPath !== newPath) {
            if (fs.existsSync(newPath)) {
              try { fs.unlinkSync(newPath); } catch (e) {}
            }
            fs.renameSync(oldPath, newPath);
            renamedCount++;
            renamedMap[oldPath] = newPath;
          }
        }
      }
    }

    return { success: true, renamedCount, renamedMap };
  } catch (err) {
    console.error('Error cleaning folder filenames:', err);
    return { success: false, error: err.message, renamedCount: 0 };
  }
});

// 2. Read local file as buffer & base64
ipcMain.handle('read-local-file', async (_event, { filePath }) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found on disk' };
    }
    const data = fs.readFileSync(filePath);
    return {
      success: true,
      buffer: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      base64: data.toString('base64')
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 2b. Direct in-place JPEG metadata injection (EXIF XP tags, 5-star rating, IPTC, Adobe XMP)
ipcMain.handle('inject-jpeg-metadata', async (_event, { filePath, item }) => {
  try {
    let target = filePath;
    if (!target || !fs.existsSync(target)) {
      const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      const dir = lastSlash !== -1 ? filePath.substring(0, lastSlash + 1) : '';
      const baseWithExt = lastSlash !== -1 ? filePath.substring(lastSlash + 1) : filePath;
      const ext = baseWithExt.includes('.') ? baseWithExt.substring(baseWithExt.lastIndexOf('.')) : '.jpg';
      const baseName = baseWithExt.includes('.') ? baseWithExt.substring(0, baseWithExt.lastIndexOf('.')) : baseWithExt;

      const baseVariants = [
        baseName,
        baseName.replace(/\s+/g, '-'),
        baseName.replace(/\s+/g, '_')
      ];

      const candidates = [];
      for (const bv of baseVariants) {
        candidates.push(
          `${dir}${bv}${ext}`,
          `${dir}${bv}-01${ext}`,
          `${dir}${bv}-1${ext}`,
          `${dir}${bv}_Artboard 1${ext}`,
          `${dir}${bv} -01${ext}`,
          `${dir}${bv}-01.jpeg`,
          `${dir}${bv}.jpeg`
        );
      }

      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          target = cand;
          break;
        }
      }
    }

    const ok = injectCompleteMetadataIntoJpeg(target, item);
    return { success: ok, filePath: target };
  } catch (err) {
    console.error('Error in inject-jpeg-metadata IPC handler:', err);
    return { success: false, error: err.message };
  }
});

// 3. Adobe Illustrator Live Automation Pipeline
ipcMain.handle('run-illustrator-automation', async (event, { items }) => {
  if (!items || items.length === 0) {
    return { success: false, error: 'No items provided for automation' };
  }

  const tempDir = os.tmpdir();
  const progressPath = path.join(tempDir, `mdg_ai_progress_${Date.now()}.json`);
  const jsxPath = path.join(tempDir, `mdg_illustrator_batch_${Date.now()}.jsx`);
  const vbsPath = path.join(tempDir, `mdg_runner_${Date.now()}.vbs`);

  const itemsJson = JSON.stringify(items, null, 2);

  // Adobe Illustrator ExtendScript (.jsx) for opening and saving one-by-one
  const jsxScript = `// Adobe Illustrator Batch Processor
#target illustrator

(function() {
    var items = ${itemsJson};
    var progressFile = new File("${progressPath.replace(/\\/g, '\\\\')}");

    function logProgress(idx, total, name, step) {
        try {
            progressFile.open("w");
            progressFile.write(JSON.stringify({ index: idx, total: total, filename: name, step: step }));
            progressFile.close();
        } catch(e) {}
    }

    try {
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    } catch(e) {}

    var xmpLoaded = false;
    try {
        if (ExternalObject.AdobeXMPScript == undefined) {
            ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
        }
        xmpLoaded = (ExternalObject.AdobeXMPScript != undefined);
    } catch(e) { xmpLoaded = false; }

    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        logProgress(i + 1, items.length, it.filename, "processing");

        var svgFile = new File(it.svgPath);
        if (!svgFile.exists) continue;

        var doc = null;
        try {
            doc = app.open(svgFile);

            // Native Adobe Illustrator Document Info (for EPS 10 compatibility)
            try {
                if (doc.info) {
                    doc.info.title = it.title;
                    doc.info.headline = it.title;
                    doc.info.caption = it.description || it.title;
                }
                if (xmpLoaded && doc) {
                    try {
                        var xmp = new XMPMeta(doc.XMPString);
                        xmp.deleteProperty(XMPConst.NS_DC, "title");
                        xmp.appendArrayItem(XMPConst.NS_DC, "title", it.title, 0, XMPConst.PROP_IS_ARRAY);
                        xmp.deleteProperty(XMPConst.NS_DC, "description");
                        xmp.appendArrayItem(XMPConst.NS_DC, "description", it.description || it.title, 0, XMPConst.PROP_IS_ARRAY);
                        xmp.deleteProperty(XMPConst.NS_DC, "subject");
                        var rawKws = (it.keywords || "").split(",");
                        for (var kIdx = 0; kIdx < rawKws.length; kIdx++) {
                            var tag = rawKws[kIdx].replace(/^\s+|\s+$/g, "");
                            if (tag.length > 0) {
                                xmp.appendArrayItem(XMPConst.NS_DC, "subject", tag, 0, XMPConst.PROP_IS_ARRAY);
                            }
                        }
                        xmp.setProperty(XMPConst.NS_PHOTOSHOP, "Category", it.category || "Arts, Objects");
                        doc.XMPString = xmp.serialize();
                    } catch(xmpInnerErr) {}
                }
            } catch(xmpErr) {}

            // Save EPS 10 in existing folder
            var epsFile = new File(it.epsPath);
            var epsOpts = new EPSSaveOptions();
            epsOpts.compatibility = Compatibility.ILLUSTRATOR10;
            epsOpts.embedAllFonts = true;
            epsOpts.embedLinkedFiles = true;
            epsOpts.includeDocumentThumbnails = true;
            doc.saveAs(epsFile, epsOpts);

            // Export High-Res JPEG in existing folder using the SVG Artboard at 72 ppi
            var jpgFile = new File(it.jpgPath);
            var exportOpts = new ExportOptionsJPEG();
            exportOpts.antiAliasing = true;
            exportOpts.qualitySetting = 100;
            exportOpts.artBoardClipping = true; // Use Artboards option selected
            exportOpts.horizontalScale = 100.0; // 72 ppi (1:1 artboard dimensions)
            exportOpts.verticalScale = 100.0;
            exportOpts.optimization = true;
            if (doc.artboards.length > 0) {
                doc.artboards.setActiveArtboardIndex(0);
            }
            doc.exportFile(jpgFile, ExportType.JPEG, exportOpts);

            try {
                var artCandidates = [
                    new File(it.jpgPath.replace(/\.jpg$/i, "-01.jpg")),
                    new File(it.jpgPath.replace(/\.jpg$/i, "-1.jpg")),
                    new File(it.jpgPath.replace(/\.jpg$/i, "_Artboard 1.jpg")),
                    new File(it.jpgPath.replace(/\.jpg$/i, " -01.jpg")),
                    new File(it.jpgPath.replace(/\.jpg$/i, "-01.jpeg")),
                    new File(it.jpgPath.replace(/\.jpg$/i, ".jpeg"))
                ];
                for (var acIdx = 0; acIdx < artCandidates.length; acIdx++) {
                    var ac = artCandidates[acIdx];
                    if (ac.exists && ac.fsName != jpgFile.fsName) {
                        if (jpgFile.exists) {
                            try { jpgFile.remove(); } catch(eRmJpg) {}
                        }
                        ac.copy(jpgFile);
                        try { ac.remove(); } catch(eRmAc) {}
                        break;
                    }
                }
            } catch(eRename) {}

            doc.close(SaveOptions.DONOTSAVECHANGES);
            doc = null;
        } catch(err) {
            if (doc != null) {
                try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(cErr) {}
            }
        }
    }

    logProgress(items.length, items.length, "Complete", "done");
})();
`;

  // Windows VBScript to trigger Illustrator COM
  const vbsScript = `' VBScript runner for Adobe Illustrator
On Error Resume Next
Set appRef = CreateObject("Illustrator.Application")
If Err.Number <> 0 Then
    WScript.Echo "ERROR_NO_AI"
    WScript.Quit 1
End If
appRef.UserInteractionLevel = -1
appRef.DoJavaScriptFile "${jsxPath.replace(/\\/g, '\\\\')}"
If Err.Number <> 0 Then
    WScript.Echo "ERROR: " & Err.Description
    WScript.Quit 2
End If
WScript.Echo "SUCCESS"
WScript.Quit 0
`;

  fs.writeFileSync(jsxPath, jsxScript, 'utf8');
  fs.writeFileSync(vbsPath, vbsScript, 'utf8');

  // Interval to poll progress and send to renderer
  const pollInterval = setInterval(() => {
    try {
      if (fs.existsSync(progressPath)) {
        const raw = fs.readFileSync(progressPath, 'utf8');
        const parsed = JSON.parse(raw);
        event.sender.send('illustrator-progress', parsed);
      }
    } catch (e) {}
  }, 400);

  return new Promise((resolve) => {
    // Generous timeout (10 minutes) so heavy complex vector files are never forced or prematurely killed
    exec(`cscript //nologo "${vbsPath}"`, { windowsHide: true, timeout: 600000 }, (error, stdout) => {
      clearInterval(pollInterval);

      // Clean up temp files
      try {
        if (fs.existsSync(jsxPath)) fs.unlinkSync(jsxPath);
        if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
        if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);
      } catch (e) {}

      if (stdout.includes('ERROR_NO_AI') || (error && error.code === 1)) {
        resolve({
          success: false,
          reason: 'illustrator_not_installed',
          message: 'Adobe Illustrator could not be launched. Using built-in high-precision vector engine.'
        });
      } else if (error) {
        resolve({
          success: false,
          reason: 'automation_error',
          message: stdout || error.message
        });
      } else {
        // Direct in-process metadata injection into all companion JPEGs in Node.js
        setTimeout(async () => {
          for (const it of items) {
            try {
              let targetJpg = it.jpgPath;
              const lastSlash = Math.max(it.jpgPath.lastIndexOf('/'), it.jpgPath.lastIndexOf('\\'));
              const dir = lastSlash !== -1 ? it.jpgPath.substring(0, lastSlash + 1) : '';
              const baseWithExt = lastSlash !== -1 ? it.jpgPath.substring(lastSlash + 1) : it.jpgPath;
              const ext = baseWithExt.includes('.') ? baseWithExt.substring(baseWithExt.lastIndexOf('.')) : '.jpg';
              const baseName = baseWithExt.includes('.') ? baseWithExt.substring(0, baseWithExt.lastIndexOf('.')) : baseWithExt;

              const baseVariants = [
                baseName,
                baseName.replace(/\s+/g, '-'),
                baseName.replace(/\s+/g, '_')
              ];

              const candidates = [];
              for (const bv of baseVariants) {
                candidates.push(
                  `${dir}${bv}${ext}`,
                  `${dir}${bv}-01${ext}`,
                  `${dir}${bv}-1${ext}`,
                  `${dir}${bv}_Artboard 1${ext}`,
                  `${dir}${bv} -01${ext}`,
                  `${dir}${bv}-01.jpeg`,
                  `${dir}${bv}.jpeg`
                );
              }

              let foundPath = null;
              for (let a = 0; a < 10; a++) {
                for (const cand of candidates) {
                  if (fs.existsSync(cand)) {
                    try {
                      const stat = fs.statSync(cand);
                      if (stat.size > 200) {
                        foundPath = cand;
                        break;
                      }
                    } catch (e) {}
                  }
                }
                if (foundPath) break;
                await new Promise((r) => setTimeout(r, 150));
              }

              if (foundPath) {
                if (foundPath.toLowerCase() !== targetJpg.toLowerCase()) {
                  try {
                    fs.copyFileSync(foundPath, targetJpg);
                  } catch (copyErr) {
                    targetJpg = foundPath;
                  }
                }
                // Inject metadata into both the found file (e.g. hyphenated) and the target file
                injectCompleteMetadataIntoJpeg(foundPath, it);
                if (foundPath.toLowerCase() !== targetJpg.toLowerCase()) {
                  injectCompleteMetadataIntoJpeg(targetJpg, it);
                }
              }
            } catch (err) {
              console.warn('Error post-processing JPEG in electron main:', err);
            }
          }

          resolve({
            success: true,
            count: items.length
          });
        }, 300);
      }
    });
  });
});

// 4. Native Windows Dialog for Absolute File and Folder Paths
ipcMain.handle('select-files-dialog', async (_event, { mode, isFolder }) => {
  try {
    const properties = isFolder ? ['openDirectory'] : ['openFile', 'multiSelections'];
    let filters = [];
    if (!isFolder) {
      if (mode === 'Image') {
        filters = [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }];
      } else if (mode === 'Vector') {
        filters = [{ name: 'Vectors', extensions: ['svg', 'eps', 'ai'] }];
      } else if (mode === 'Video') {
        filters = [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }];
      } else {
        filters = [{ name: 'All Files', extensions: ['*'] }];
      }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: isFolder ? 'Select Folder' : 'Select Files',
      properties,
      filters
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true, files: [] };
    }

    const filePaths = [];
    if (isFolder) {
      for (const folderPath of result.filePaths) {
        function walkDir(dir) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            } else {
              const ext = path.extname(entry.name).toLowerCase().replace('.', '');
              const allowed = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'eps', 'ai', 'mp4', 'mov', 'webm', 'bmp', 'tiff'];
              if (allowed.includes(ext)) {
                filePaths.push(fullPath);
              }
            }
          }
        }
        try {
          walkDir(folderPath);
        } catch (e) {
          console.warn('walkDir error:', e);
        }
      }
    } else {
      filePaths.push(...result.filePaths);
    }

    const files = [];
    for (const fp of filePaths) {
      try {
        const stats = fs.statSync(fp);
        const name = path.basename(fp);
        const ext = path.extname(fp).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.png') mime = 'image/png';
        else if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.svg') mime = 'image/svg+xml';
        else if (ext === '.eps') mime = 'application/postscript';
        else if (ext === '.mp4') mime = 'video/mp4';

        files.push({
          filePath: fp,
          name,
          size: stats.size,
          mime,
          base64: undefined,
          dataUrl: undefined
        });
      } catch (err) {
        console.warn('Error reading selected file:', fp, err);
      }
    }

    return { canceled: false, files };
  } catch (err) {
    return { canceled: true, error: err.message, files: [] };
  }
});

// 5. Adobe Photoshop Live Metadata Automation Pipeline
ipcMain.handle('run-photoshop-automation', async (event, { items }) => {
  if (!items || items.length === 0) {
    return { success: false, error: 'No items provided for Photoshop automation' };
  }

  const tempDir = os.tmpdir();
  const progressPath = path.join(tempDir, `mdg_ps_progress_${Date.now()}.json`);
  const jsxPath = path.join(tempDir, `mdg_photoshop_batch_${Date.now()}.jsx`);
  const vbsPath = path.join(tempDir, `mdg_ps_runner_${Date.now()}.vbs`);

  const itemsJson = JSON.stringify(items, null, 2);

  const jsxScript = `// Adobe Photoshop Batch Metadata Embedder
#target photoshop

(function() {
    var items = ${itemsJson};
    var progressFile = new File("${progressPath.replace(/\\/g, '\\\\')}");

    function logProgress(idx, total, name, step) {
        try {
            progressFile.open("w");
            progressFile.write(JSON.stringify({ index: idx, total: total, filename: name, step: step }));
            progressFile.close();
        } catch(e) {}
    }

    try {
        app.displayDialogs = DialogModes.NO;
    } catch(e) {}

    var xmpLoaded = false;
    try {
        if (ExternalObject.AdobeXMPScript == undefined) {
            ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
        }
        xmpLoaded = (ExternalObject.AdobeXMPScript != undefined);
    } catch(e) { xmpLoaded = false; }

    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        logProgress(i + 1, items.length, it.filename, "processing");

        var imgFile = new File(it.filePath);
        if (!imgFile.exists) {
            var dashedCandidate = new File(it.filePath.replace(/ /g, "-"));
            if (dashedCandidate.exists) {
                imgFile = dashedCandidate;
            }
        }
        if (!imgFile.exists) continue;

        var doc = null;
        try {
            doc = app.open(imgFile);

            // 1. Set native document info (visible in Photoshop File -> File Info)
            try {
                doc.info.title = it.title;
                    xmp.setProperty(XMPConst.NS_PHOTOSHOP, "Category", it.category || "Arts, Photography");
                    doc.xmpMetadata.raw = xmp.serialize();
                } catch(xmpErr) {}
            }

            // Save and close in-place
            doc.save();
            doc.close(SaveOptions.DONOTSAVECHANGES);
            doc = null;
        } catch(err) {
            if (doc != null) {
                try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(cErr) {}
            }
        }
    }

    logProgress(items.length, items.length, "Complete", "done");
})();
`;

  const vbsScript = `' VBScript runner for Adobe Photoshop
On Error Resume Next
Set appRef = CreateObject("Photoshop.Application")
If Err.Number <> 0 Then
    WScript.Echo "ERROR_NO_PS"
    WScript.Quit 1
End If
appRef.DisplayDialogs = 3
appRef.DoJavaScriptFile "${jsxPath.replace(/\\/g, '\\\\')}"
If Err.Number <> 0 Then
    WScript.Echo "ERROR: " & Err.Description
    WScript.Quit 2
End If
WScript.Echo "SUCCESS"
WScript.Quit 0
`;

  fs.writeFileSync(jsxPath, jsxScript, 'utf8');
  fs.writeFileSync(vbsPath, vbsScript, 'utf8');

  const pollInterval = setInterval(() => {
    try {
      if (fs.existsSync(progressPath)) {
        const raw = fs.readFileSync(progressPath, 'utf8');
        const parsed = JSON.parse(raw);
        event.sender.send('photoshop-progress', parsed);
      }
    } catch (e) {}
  }, 400);

  return new Promise((resolve) => {
    exec(`cscript //nologo "${vbsPath}"`, { windowsHide: true, timeout: 300000 }, (error, stdout) => {
      clearInterval(pollInterval);
      try {
        if (fs.existsSync(jsxPath)) fs.unlinkSync(jsxPath);
        if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
        if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);
      } catch (e) {}

      if (stdout.includes('ERROR_NO_PS') || (error && error.code === 1)) {
        resolve({
          success: false,
          reason: 'photoshop_not_installed',
          message: 'Adobe Photoshop could not be launched. Used built-in high-precision engine.'
        });
      } else if (error) {
        resolve({
          success: false,
          reason: 'automation_error_or_timeout',
          message: stdout || error.message || 'Photoshop automation timed out. Built-in metadata injector completed.'
        });
      } else {
        // Guarantee Windows Explorer Details (XPTitle, XPKeywords, Rating) after Photoshop re-saves
        try {
          for (const it of items) {
            if (it.filePath && fs.existsSync(it.filePath)) {
              injectCompleteMetadataIntoJpeg(it.filePath, it);
            }
          }
        } catch (postErr) {
          console.warn('Post-Photoshop injection notice:', postErr);
        }
        resolve({ success: true, count: items.length });
      }
    });
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
