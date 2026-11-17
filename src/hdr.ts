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
  /**
   * What the stored values must be multiplied by to give the photograph's radiance:
   * 1, unless the photograph is brighter than a half float can hold, in which case
   * the whole image was divided by it so its brightest value is the largest half.
   */
  readonly scale: number;
}

/** The largest finite half float. */
const MAX_HALF = 65504;
const HALF_ONE = 0x3c00;
const NEWLINE = 0x0a;

/**
 * The 16-bit pattern of a non-negative number as a half float, rounded to nearest
 * even. Anything above the largest half is clamped to it; `decodeHdr` scales a
 * photograph first, so for a photograph that only ever absorbs rounding.
 */
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

/** The value of a channel byte of 1 under each exponent: `2^(e − 136)`, and 0 for black. */
const EXPONENTS = Float64Array.from({ length: 256 }, (_, e) => (e === 0 ? 0 : 2 ** (e - 136)));

/**
 * Every channel value an RGBE pixel can hold, divided by `scale`, as a half float:
 * index `e * 256 + byte` holds `byte × 2^(e − 136) / scale`, and exponent 0 is black.
 */
let unscaledTable: Uint16Array | undefined;
function channels(scale: number): Uint16Array {
  if (scale === 1 && unscaledTable) return unscaledTable;
  const table = new Uint16Array(256 * 256);
  for (let e = 1; e < 256; e++) {
    const unit = EXPONENTS[e] / scale;
    for (let byte = 0; byte < 256; byte++) table[e * 256 + byte] = halfFloat(byte * unit);
  }
  if (scale === 1) unscaledTable = table;
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

  // Every pixel's RGBE bytes, rows from the top, read before any is converted: the
  // brightest value decides the scale of all of them.
  const rgbe = new Uint8Array(width * height * 4);
  let brightest = 0;
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
      const r = scanline[x];
      const g = scanline[width + x];
      const b = scanline[2 * width + x];
      const e = scanline[3 * width + x];
      rgbe[out] = r;
      rgbe[out + 1] = g;
      rgbe[out + 2] = b;
      rgbe[out + 3] = e;
      brightest = Math.max(brightest, Math.max(r, g, b) * EXPONENTS[e]);
      out += 4;
    }
  }

  // Brighter than a half float can hold (the sun, in a daylight photograph): the whole
  // image is divided so nothing is clipped, and `scale` gives the brightness back.
  const scale = brightest > MAX_HALF ? brightest / MAX_HALF : 1;
  const table = channels(scale);
  const pixels = new Uint16Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const e = rgbe[i + 3];
    if (e === 0) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    } else {
      const row = e * 256;
      pixels[i] = table[row + rgbe[i]];
      pixels[i + 1] = table[row + rgbe[i + 1]];
      pixels[i + 2] = table[row + rgbe[i + 2]];
    }
    pixels[i + 3] = HALF_ONE;
  }
  return { width, height, pixels, scale };
}
