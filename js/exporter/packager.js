export function validatePluginProject(project) {
  const errors = [];
  const rawManifest = project?.files?.['plugin.json'];

  if (!rawManifest) {
    return { valid: false, errors: ['File plugin.json tidak ditemukan.'] };
  }

  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (e) {
    return { valid: false, errors: [`Sintaks JSON error: ${e.message}`] };
  }

  // Validasi ID reverse-domain (contoh: com.nikoajj.matchacc)
  if (!manifest.id || !/^[a-z0-9]+(\.[a-z0-9_-]+)+$/i.test(manifest.id)) {
    errors.push('Field "id" harus format reverse-domain (mis. com.nikoajj.namaplugin).');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Field "name" wajib diisi.');
  }

  const ver = Number(manifest.formatVersion || project.version || 1);
  if (![1, 2, 3].includes(ver)) {
    errors.push('formatVersion harus bernilai 1, 2, atau 3.');
  }

  const kind = manifest.kind || 'shader';
  if ((kind === 'shader' || kind === 'shader3d') && !manifest.entry) {
    errors.push(`Plugin jenis "${kind}" wajib menentukan field "entry" (mis. "shader.frag").`);
  }

  if (manifest.entry && !project.files[manifest.entry]) {
    errors.push(`File entry "${manifest.entry}" tidak ditemukan dalam proyek.`);
  }

  if (Array.isArray(manifest.params) && manifest.params.length > 32) {
    errors.push('Jumlah parameter melebihi batas maksimal Aurea (maks. 32 params).');
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest
  };
}

// Pure JS ZIP Builder (Zero-dependency) untuk menghasilkan file .aureaplugin valid
export function exportAureaPlugin(project) {
  const check = validatePluginProject(project);
  if (!check.valid) {
    return { ok: false, errors: check.errors };
  }

  const encoder = new TextEncoder();
  const fileEntries = Object.entries(project.files);
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  fileEntries.forEach(([filename, content]) => {
    const nameBytes = encoder.encode(filename);
    const dataBytes = content instanceof Uint8Array ? content : encoder.encode(String(content));
    const crc = crc32(dataBytes);

    // Local File Header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true);         // Version needed
    lv.setUint16(6, 0x0800, true);     // UTF-8 flag
    lv.setUint16(8, 0, true);          // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true);         // Mod time
    lv.setUint16(12, 0, true);         // Mod date
    lv.setUint32(14, crc, true);       // CRC-32
    lv.setUint32(18, dataBytes.length, true); // Compressed size
    lv.setUint32(22, dataBytes.length, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true);         // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    // Central Directory Header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);         // Version made by
    cv.setUint16(6, 20, true);         // Version needed
    cv.setUint16(8, 0x0800, true);     // UTF-8 flag
    cv.setUint16(10, 0, true);         // Compression: STORE
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);    // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);   // End of central directory signature
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, fileEntries.length, true);
  ev.setUint16(10, fileEntries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blob = new Blob([...localChunks, ...centralChunks, eocd], {
    type: 'application/octet-stream'
  });

  const safeName = (check.manifest.name || project.name || 'plugin').replace(/[^a-zA-Z0-9_-]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.aureaplugin`;
  a.click();
  URL.revokeObjectURL(url);

  return { ok: true, filename: `${safeName}.aureaplugin` };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
