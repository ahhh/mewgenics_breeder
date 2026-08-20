/**
 * Sequential reader for Glaiel-engine serialised records.
 *
 * Two string encodings appear in Mewgenics saves:
 *   narrow — u64 byteCount + ASCII bytes        (identifiers: "Fireball", "Tank")
 *   wide   — u64 charCount + UTF-16LE code units (the cat's name)
 *
 * The reader is deliberately cursor-based rather than offset-based: the cat
 * record is a sequential serialisation, and walking it is both exact and
 * self-describing, unlike scanning for plausible-looking integers.
 */
export class BinaryReader {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private cursor = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get offset(): number {
    return this.cursor;
  }

  get length(): number {
    return this.bytes.length;
  }

  seek(offset: number): this {
    if (offset < 0 || offset > this.bytes.length) {
      throw new ReadError(`seek to ${offset} outside 0..${this.bytes.length}`);
    }
    this.cursor = offset;
    return this;
  }

  skip(count: number): this {
    return this.seek(this.cursor + count);
  }

  private need(count: number, what: string): void {
    if (this.cursor + count > this.bytes.length) {
      throw new ReadError(`reading ${what} at ${this.cursor} runs past end (${this.bytes.length})`);
    }
  }

  u16(): number {
    this.need(2, 'u16');
    const v = this.view.getUint16(this.cursor, true);
    this.cursor += 2;
    return v;
  }

  u32(): number {
    this.need(4, 'u32');
    const v = this.view.getUint32(this.cursor, true);
    this.cursor += 4;
    return v;
  }

  i32(): number {
    this.need(4, 'i32');
    const v = this.view.getInt32(this.cursor, true);
    this.cursor += 4;
    return v;
  }

  u64(): bigint {
    this.need(8, 'u64');
    const v = this.view.getBigUint64(this.cursor, true);
    this.cursor += 8;
    return v;
  }

  i64(): bigint {
    this.need(8, 'i64');
    const v = this.view.getBigInt64(this.cursor, true);
    this.cursor += 8;
    return v;
  }

  f64(): number {
    this.need(8, 'f64');
    const v = this.view.getFloat64(this.cursor, true);
    this.cursor += 8;
    return v;
  }

  /** Peek a u64 length without advancing — used to validate before committing. */
  peekLength(at = this.cursor): number | null {
    if (at + 8 > this.bytes.length) return null;
    const raw = this.view.getBigUint64(at, true);
    if (raw > 4096n) return null;
    return Number(raw);
  }

  /** u64 byteCount + ASCII bytes. */
  narrowString(maxLength = 256): string {
    const start = this.cursor;
    const length = this.peekLength();
    if (length === null || length > maxLength) {
      throw new ReadError(`implausible narrow-string length at ${start}`);
    }
    this.cursor += 8;
    this.need(length, 'narrow string body');
    let out = '';
    for (let i = 0; i < length; i += 1) out += String.fromCharCode(this.bytes[this.cursor + i]!);
    this.cursor += length;
    return out;
  }

  /** u64 charCount + UTF-16LE code units. */
  wideString(maxLength = 256): string {
    const start = this.cursor;
    const length = this.peekLength();
    if (length === null || length > maxLength) {
      throw new ReadError(`implausible wide-string length at ${start}`);
    }
    this.cursor += 8;
    this.need(length * 2, 'wide string body');
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += String.fromCharCode(this.view.getUint16(this.cursor + i * 2, true));
    }
    this.cursor += length * 2;
    return out;
  }
}

export class ReadError extends Error {
  override name = 'ReadError';
}

/** True if every byte in the range is printable ASCII. */
export function isPrintableAscii(bytes: Uint8Array, start: number, length: number): boolean {
  if (start + length > bytes.length) return false;
  for (let i = 0; i < length; i += 1) {
    const c = bytes[start + i]!;
    if (c < 0x20 || c >= 0x7f) return false;
  }
  return true;
}
