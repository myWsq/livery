/**
 * Where the browser finds the lighting photographs and their detail images. Each file
 * under `environments/` is its own asset (hashed in a production build) and is fetched
 * only when asked for. Browser only: the Node scripts read the files directly.
 */
import type { Environment } from "./environments.ts";

const urls = import.meta.glob<string>("../environments/*.hdr", {
  query: "?url",
  import: "default",
  eager: true,
});

const backdropUrls = import.meta.glob<string>("../environments/*.jpg", {
  query: "?url",
  import: "default",
  eager: true,
});

/** Fetches an environment's photograph; rejects with a short message when it cannot. */
export async function fetchEnvironment(environment: Environment): Promise<Uint8Array> {
  const response = await download(urls[`../environments/${environment.file}`]);
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error("下载中断");
  }
}

/**
 * Fetches and decodes an environment's detail image, as it is in the file: no colour
 * conversion and no premultiplied alpha. Rejects with a short message when it cannot.
 * The caller closes the bitmap.
 */
export async function fetchBackdrop(environment: Environment): Promise<ImageBitmap> {
  const response = await download(backdropUrls[`../environments/${environment.backdrop}`]);
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    throw new Error("下载中断");
  }
  try {
    return await createImageBitmap(blob, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
  } catch {
    throw new Error("图片无法解码");
  }
}

/** The response for an asset's URL; rejects with a short message when there is none. */
async function download(url: string | undefined): Promise<Response> {
  if (url === undefined) throw new Error("文件不存在");
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("网络请求失败");
  }
  if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
  return response;
}
