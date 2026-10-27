const electron = require('electron');
const { contextBridge, ipcRenderer, webUtils } = electron;
const fs = require('fs');
const path = require('path');

const electronApi = {
  isElectron: true,
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const p = webUtils.getPathForFile(file);
        if (p) return p;
      }
    } catch (e) {}
    return file ? (file.path || '') : '';
  },
  selectFilesOrFolder: (mode, isFolder) =>
    ipcRenderer.invoke('select-files-dialog', { mode, isFolder }),
  writeLocalFile: (filePath, data, oldPath) => {
    try {
      let buffer;
      if (Buffer.isBuffer(data)) {
        buffer = data;
      } else if (data instanceof Uint8Array || (data && data.buffer instanceof ArrayBuffer)) {
        buffer = Buffer.from(data.buffer, data.byteOffset || 0, data.byteLength);
      } else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data);
      } else if (typeof data === 'string') {
        const trimmed = data.trim();
        const isBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0 && !trimmed.startsWith('%!PS') && !trimmed.startsWith('<?xml') && !trimmed.startsWith('<svg');
        buffer = isBase64 ? Buffer.from(trimmed, 'base64') : Buffer.from(data, 'utf8');
      } else {
        buffer = Buffer.from(data);
      }
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      if (oldPath && oldPath !== filePath && fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
      return Promise.resolve({ success: true, filePath });
    } catch (err) {
      return ipcRenderer.invoke('write-local-file', { filePath, base64Data: data, oldPath });
    }
  },
  renameLocalFile: (oldPath, newPath) => {
    try {
      if (fs.existsSync(oldPath)) {
        if (oldPath === newPath) return Promise.resolve({ success: true, newPath });
        if (fs.existsSync(newPath)) {
          try { fs.unlinkSync(newPath); } catch (e) {}
        }
        fs.renameSync(oldPath, newPath);
        return Promise.resolve({ success: true, newPath });
      }
    } catch (e) {}
    return ipcRenderer.invoke('rename-local-file', { oldPath, newPath });
  },
  deleteLocalFile: (filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return Promise.resolve({ success: true });
      }
    } catch (e) {}
    return ipcRenderer.invoke('delete-local-file', { filePath });
  },
  cleanFolderFiles: (folderPath) => {
    try {
      if (fs && typeof fs.readdirSync === 'function' && typeof fs.renameSync === 'function') {
        if (!folderPath || !fs.existsSync(folderPath)) {
          return Promise.resolve({ success: false, error: 'Folder does not exist', renamedCount: 0 });
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
        return Promise.resolve({ success: true, renamedCount, renamedMap });
      }
    } catch (e) {}
    return ipcRenderer.invoke('clean-folder-filenames', { folderPath });
  },
  readLocalFile: (filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        return Promise.resolve({
          success: true,
          buffer: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
          base64: data.toString('base64')
        });
      }
    } catch (e) {}
    return ipcRenderer.invoke('read-local-file', { filePath });
  },
  runIllustratorAutomation: (items) =>
    ipcRenderer.invoke('run-illustrator-automation', { items }),
  injectJpegMetadata: (filePath, item) =>
    ipcRenderer.invoke('inject-jpeg-metadata', { filePath, item }),
  onIllustratorProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('illustrator-progress', handler);
    return () => ipcRenderer.removeListener('illustrator-progress', handler);
  },
  runPhotoshopAutomation: (items) =>
    ipcRenderer.invoke('run-photoshop-automation', { items }),
  onPhotoshopProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('photoshop-progress', handler);
    return () => ipcRenderer.removeListener('photoshop-progress', handler);
  }
};

// Expose directly to window
if (typeof window !== 'undefined') {
  window.electronApi = electronApi;
}

// Also expose via contextBridge if available
try {
  if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
    contextBridge.exposeInMainWorld('electronApi', electronApi);
  }
} catch (e) {}

module.exports = electronApi;
