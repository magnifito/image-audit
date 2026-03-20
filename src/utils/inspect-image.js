import fs from 'node:fs';

/**
 * Web-viable image format signatures.
 * Each entry defines magic bytes, structural markers, and the canonical ext/mime.
 */
const WEB_FORMATS = [
  {
    ext: 'png',
    mime: 'image/png',
    // 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A
    magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    validate(buf) {
      // IHDR must be the first chunk (bytes 12–15)
      return buf.length >= 16 && buf.toString('ascii', 12, 16) === 'IHDR';
    },
  },
  {
    ext: 'jpg',
    mime: 'image/jpeg',
    // SOI marker: FF D8
    magic: Buffer.from([0xff, 0xd8]),
    validate(buf) {
      // Third byte should be FF (start of a JFIF/EXIF/APP marker)
      return buf.length >= 3 && buf[2] === 0xff;
    },
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    // GIF87a or GIF89a
    magic: Buffer.from([0x47, 0x49, 0x46, 0x38]),
    validate(buf) {
      if (buf.length < 6) return false;
      const version = buf.toString('ascii', 4, 6);
      return version === '7a' || version === '9a';
    },
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    // RIFF....WEBP
    magic: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    validate(buf) {
      if (buf.length < 12) return false;
      return buf.toString('ascii', 8, 12) === 'WEBP';
    },
  },
  {
    ext: 'avif',
    mime: 'image/avif',
    // ISOBMFF: bytes 4–7 = "ftyp"
    magic: null,
    validate(buf) {
      if (buf.length < 12) return false;
      if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;
      // Major brand or compatible brands should contain avif, avis, or mif1
      const brands = buf.toString('ascii', 8, Math.min(buf.length, 32));
      return /avif|avis|mif1/.test(brands);
    },
  },
  {
    ext: 'ico',
    mime: 'image/x-icon',
    // 00 00 01 00 (ICO) or 00 00 02 00 (CUR)
    magic: Buffer.from([0x00, 0x00]),
    validate(buf) {
      if (buf.length < 6) return false;
      const type = buf.readUInt16LE(2);
      if (type !== 1 && type !== 2) return false;
      const count = buf.readUInt16LE(4);
      return count > 0 && count < 256;
    },
  },
];

/**
 * SVG validation — checks structure beyond just an opening tag.
 * Handles XML preamble elements (declarations, processing instructions,
 * DOCTYPE, comments) in any order before the <svg> element.
 */
function inspectSvg(buf) {
  let str = buf.toString('utf8');

  // Strip BOM if present
  if (str.charCodeAt(0) === 0xfeff) str = str.slice(1);

  let body = str.trimStart();

  // Strip XML preamble elements in any order until we hit <svg or non-preamble
  let changed = true;
  while (changed) {
    changed = false;

    // Processing instructions: <?xml ...?>, <?xml-stylesheet ...?>, etc.
    if (body.startsWith('<?')) {
      const end = body.indexOf('?>');
      if (end === -1) return null;
      body = body.slice(end + 2).trimStart();
      changed = true;
    }
    // DOCTYPE (with optional internal subset [...])
    else if (/^<!DOCTYPE/i.test(body)) {
      const bracketIdx = body.indexOf('[');
      const gtIdx = body.indexOf('>');
      if (gtIdx === -1) return null;
      if (bracketIdx !== -1 && bracketIdx < gtIdx) {
        const closeIdx = body.indexOf(']>');
        if (closeIdx === -1) return null;
        body = body.slice(closeIdx + 2).trimStart();
      } else {
        body = body.slice(gtIdx + 1).trimStart();
      }
      changed = true;
    }
    // Comments
    else if (body.startsWith('<!--')) {
      const end = body.indexOf('-->');
      if (end === -1) return null;
      body = body.slice(end + 3).trimStart();
      changed = true;
    }
  }

  if (!body.startsWith('<svg')) return null;

  // Verify it has the SVG namespace or at least xmlns attribute
  const tagEnd = body.indexOf('>');
  if (tagEnd === -1) return null;
  const openTag = body.slice(0, tagEnd + 1);

  const hasNamespace = openTag.includes('xmlns');
  const hasViewBox = openTag.includes('viewBox');
  const hasDimensions = openTag.includes('width') || openTag.includes('height');

  return {
    ext: 'svg',
    mime: 'image/svg+xml',
    valid: true,
    hasNamespace,
    hasViewBox,
    hasDimensions,
  };
}

/**
 * Inspect a file's raw bytes to determine its actual image format
 * and validate structural integrity for web use.
 *
 * @param {string} filePath
 * @returns {{ ext: string, mime: string, valid: boolean, format: string } | null}
 */
export function inspectImage(filePath) {
  let fd;
  let fileSize;
  let buf;
  try {
    fd = fs.openSync(filePath, 'r');
    fileSize = fs.fstatSync(fd).size;
    const readSize = Math.min(fileSize, 4096);
    buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize);
    fs.closeSync(fd);
    fd = undefined;
  } catch {
    return null;
  }

  if (buf.length === 0) return null;

  // Try binary formats first (magic bytes in first 4 KB is always enough)
  for (const fmt of WEB_FORMATS) {
    if (fmt.magic && !buf.subarray(0, fmt.magic.length).equals(fmt.magic)) continue;
    if (!fmt.validate(buf)) continue;
    return { ext: fmt.ext, mime: fmt.mime, valid: true, format: fmt.ext };
  }

  // Try SVG (text-based) — read more bytes if needed since SVG preambles
  // (XML declarations, processing instructions, comments) can be long
  let svgBuf = buf;
  if (fileSize > 4096 && !buf.includes(0x00)) {
    try {
      fd = fs.openSync(filePath, 'r');
      const readSize = Math.min(fileSize, 65536);
      svgBuf = Buffer.alloc(readSize);
      fs.readSync(fd, svgBuf, 0, readSize);
      fs.closeSync(fd);
    } catch {
      // Fall through with the original buffer
    }
  }

  const svgResult = inspectSvg(svgBuf);
  if (svgResult) return { ...svgResult, format: 'svg' };

  return null;
}

/**
 * Set of extensions considered viable for web <img> usage.
 */
export const WEB_IMAGE_EXTS = new Set(
  WEB_FORMATS.map((f) => f.ext).concat(['jpeg', 'svg'])
);
