/**
 * Where the browser finds the car: `models/porsche-911.car` is its own asset (hashed in
 * a production build), fetched once at start. Browser only: the Node scripts read the
 * file directly.
 */
import carUrl from "../models/porsche-911.car?url";

import { loadCarModel, type CarModel } from "./car/index.ts";

/** Fetches and decodes the car; rejects with a short message when it cannot. */
export async function fetchCarModel(): Promise<CarModel> {
  let response: Response;
  try {
    response = await fetch(carUrl);
  } catch {
    throw new Error("车模下载失败");
  }
  if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error("车模下载失败");
  }
  try {
    return loadCarModel(bytes);
  } catch (error) {
    throw new Error(
      `车模文件无法解析（${error instanceof Error ? error.message : String(error)}）`,
    );
  }
}
