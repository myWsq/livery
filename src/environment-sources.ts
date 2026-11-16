/**
 * Where the browser finds the lighting photographs. Each file under `environments/`
 * is its own asset (hashed in a production build) and is fetched only when asked for.
 * Browser only: the Node scripts read the files directly.
 */
import type { Environment } from "./environments.ts";

const urls = import.meta.glob<string>("../environments/*.hdr", {
  query: "?url",
  import: "default",
  eager: true,
});

/** Fetches an environment's photograph; rejects with a short message when it cannot. */
export async function fetchEnvironment(environment: Environment): Promise<Uint8Array> {
  const url = urls[`../environments/${environment.file}`];
  if (url === undefined) throw new Error("文件不存在");
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("网络请求失败");
  }
  if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error("下载中断");
  }
}
