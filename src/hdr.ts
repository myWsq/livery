/**
 * Decodes a Radiance `.hdr` file (RGBE pixels, run-length coded or flat) into half
 * floats the GPU can take as an `rgba16float` texture. Shared by the browser and the
 * Node scripts: it reads only the bytes it is handed.
 */

/** A decoded photograph. */
export interface HdrImage {
  readonly width: number;
  readonly height: number;
  /** RGBA half floats as their 16-bit patterns, rows from the top of the image down. */
  readonly pixels: Uint16Array<ArrayBuffer>;
}

/** The largest finite half float; brighter values are clamped to it. */
const MAX_HALF = 65504;
const HALF_ONE = 0x3c00;
const NEWLINE = 0x0a;

/** The 16-bit pattern of a non-negative number as a half float, rounded to nearest even. */
export function halfFloat(value: number): number {
  const clamped = Math.min(Math.max(value, 0), MAX_HALF);
  const bits = float32Bits(clamped);
  if (bits < 113 << 23) {
    // Below the smallest normal half: adding 0.5 lines the mantissa up with the
    // half's subnormal bits, and float rounding does the rest.
    return float32Bits(clamped + 0.5) - float32Bits(0.5);
  }
  const odd = (bits >>> 13) & 1;
  return (bits + ((15 - 127) << 23) + 0xfff + odd) >>> 13;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function float32Bits(value: number): number {
  f32[0] = value;
  return u32[0];
}

/**
 * Every channel value an RGBE pixel can hold, as a half float: index `e * 256 + byte`
 * holds `byte × 2^(e − 136)`, and exponent 0 is black.
 */
let channelTable: Uint16Array | undefined;
function channels(): Uint16Array {
  if (channelTable) return channelTable;
  const table = new Uint16Array(256 * 256);
  for (let e = 1; e < 256; e++) {
    const scale = 2 ** (e - 136);
    for (let byte = 0; byte < 256; byte++) table[e * 256 + byte] = halfFloat(byte * scale);
  }
  channelTable = table;
  return table;
}

export function decodeHdr(bytes: Uint8Array): HdrImage {
  if (bytes[0] !== 0x23 || bytes[1] !== 0x3f) throw new Error("not a Radiance file");
  let at = 0;
  const readLine = (): string => {
    const end = bytes.indexOf(NEWLINE, at);
    if (end < 0) throw new Error("data ends early, in the header");
    let line = "";
    for (let i = at; i < end; i++) line += String.fromCharCode(bytes[i]);
    at = end + 1;
    return line;
  };

  readLine();
  let format: string | undefined;
  for (let line = readLine(); line !== ""; line = readLine()) {
    if (line.startsWith("FORMAT=")) format = line.slice("FORMAT=".length).trim();
  }
  if (format !== "32-bit_rle_rgbe") {
    throw new Error(`unsupported pixel format: ${format ?? "none given"}`);
  }
  const resolution = readLine();
  const match = /^-Y (\d+) \+X (\d+)$/.exec(resolution.trim());
  if (!match) throw new Error(`unsupported orientation: ${resolution.trim()}`);
  const height = Number(match[1]);
  const width = Number(match[2]);
  if (width === 0 || height === 0) throw new Error("the image is empty");

  const table = channels();
  const pixels = new Uint16Array(width * height * 4);
  // One scanline, channel after channel: all red bytes, then green, blue, exponent.
  const scanline = new Uint8Array(width * 4);
  const ensure = (count: number) => {
    if (at + count > bytes.length) throw new Error("data ends early");
  };

  for (let y = 0; y < height; y++) {
    ensure(4);
    const coded =
      bytes[at] === 2 && bytes[at + 1] === 2 && ((bytes[at + 2] << 8) | bytes[at + 3]) === width;
    if (coded) {
      at += 4;
      for (let channel = 0; channel < 4; channel++) {
        const start = channel * width;
        for (let x = 0; x < width;) {
          ensure(1);
          let count = bytes[at++];
          if (count > 128) {
            count -= 128;
            if (x + count > width) throw new Error("a run overruns its scanline");
            ensure(1);
            scanline.fill(bytes[at++], start + x, start + x + count);
          } else {
            if (count === 0) throw new Error("a run of length zero");
            if (x + count > width) throw new Error("a run overruns its scanline");
            ensure(count);
            scanline.set(bytes.subarray(at, at + count), start + x);
            at += count;
          }
          x += count;
        }
      }
    } else {
      // Flat pixels, four bytes each: rearranged channel after channel like a coded one.
      ensure(width * 4);
      for (let x = 0; x < width; x++) {
        for (let channel = 0; channel < 4; channel++) {
          scanline[channel * width + x] = bytes[at + x * 4 + channel];
        }
      }
      at += width * 4;
    }

    let out = y * width * 4;
    for (let x = 0; x < width; x++) {
      const e = scanline[3 * width + x];
      if (e === 0) {
        pixels[out] = pixels[out + 1] = pixels[out + 2] = 0;
      } else {
        const row = e * 256;
        pixels[out] = table[row + scanline[x]];
        pixels[out + 1] = table[row + scanline[width + x]];
        pixels[out + 2] = table[row + scanline[2 * width + x]];
      }
      pixels[out + 3] = HALF_ONE;
      out += 4;
    }
  }
  return { width, height, pixels };
}
