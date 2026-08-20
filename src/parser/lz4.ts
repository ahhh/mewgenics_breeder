/**
 * LZ4 block-format decompressor.
 *
 * Hand-written rather than pulled from npm: we only ever decompress, the block
 * format is ~40 lines, and it removes a WASM dependency whose competing
 * "variants" have confused prior community tools.
 *
 * Spec: https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md
 */

export function decompressBlock(src: Uint8Array, expectedSize: number): Uint8Array {
  const dst = new Uint8Array(expectedSize);
  let s = 0;
  let d = 0;

  while (s < src.length) {
    const token = src[s]!;
    s += 1;

    // Literals
    let literalLength = token >> 4;
    if (literalLength === 15) {
      let more: number;
      do {
        if (s >= src.length) throw new Lz4Error('truncated literal length');
        more = src[s]!;
        s += 1;
        literalLength += more;
      } while (more === 255);
    }

    if (s + literalLength > src.length) throw new Lz4Error('literal run overruns input');
    if (d + literalLength > dst.length) throw new Lz4Error('literal run overruns output');
    dst.set(src.subarray(s, s + literalLength), d);
    s += literalLength;
    d += literalLength;

    // The final block ends after its literals, with no match.
    if (s >= src.length) break;

    // Match
    if (s + 2 > src.length) throw new Lz4Error('truncated match offset');
    const offset = src[s]! | (src[s + 1]! << 8);
    s += 2;
    if (offset === 0) throw new Lz4Error('zero match offset');

    let matchLength = token & 0x0f;
    if (matchLength === 15) {
      let more: number;
      do {
        if (s >= src.length) throw new Lz4Error('truncated match length');
        more = src[s]!;
        s += 1;
        matchLength += more;
      } while (more === 255);
    }
    matchLength += 4; // minmatch

    let from = d - offset;
    if (from < 0) throw new Lz4Error('match offset points before output start');
    if (d + matchLength > dst.length) throw new Lz4Error('match overruns output');

    // Byte-by-byte: overlapping matches (offset < matchLength) are legal and
    // are how LZ4 encodes runs, so copyWithin would be wrong here.
    for (let i = 0; i < matchLength; i += 1) {
      dst[d] = dst[from]!;
      d += 1;
      from += 1;
    }
  }

  if (d !== expectedSize) {
    throw new Lz4Error(`size mismatch: produced ${d}, expected ${expectedSize}`);
  }
  return dst;
}

export type Lz4Variant = 'A' | 'B';

export interface DecompressedBlob {
  data: Uint8Array;
  variant: Lz4Variant;
}

/**
 * Unwrap a cat blob.
 *
 * Variant A: [u32 uncompressedSize][block]              — the only one observed
 * Variant B: [u32 uncompressedSize][u32 compressedSize][block]
 *
 * We try B first but only accept it if the result is exactly the declared size,
 * so a variant-A blob whose bytes 4..8 happen to look like a length can't be
 * misread.
 */
export function unwrapCatBlob(wrapped: Uint8Array): DecompressedBlob {
  if (wrapped.length < 8) throw new Lz4Error('blob too small to hold a header');

  const view = new DataView(wrapped.buffer, wrapped.byteOffset, wrapped.byteLength);
  const uncompressedSize = view.getUint32(0, true);
  if (uncompressedSize === 0 || uncompressedSize > 64 * 1024 * 1024) {
    throw new Lz4Error(`implausible uncompressed size ${uncompressedSize}`);
  }

  const compressedSize = view.getUint32(4, true);
  if (compressedSize > 0 && compressedSize <= wrapped.length - 8) {
    try {
      const data = decompressBlock(wrapped.subarray(8, 8 + compressedSize), uncompressedSize);
      return { data, variant: 'B' };
    } catch {
      // Not variant B after all — fall through.
    }
  }

  return { data: decompressBlock(wrapped.subarray(4), uncompressedSize), variant: 'A' };
}

export class Lz4Error extends Error {
  override name = 'Lz4Error';
}
