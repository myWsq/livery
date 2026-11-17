/**
 * The car the workshop shows. It arrives as a `.car` file (the format of `format.ts`),
 * made from a published model by `scripts/import-car.ts`; the browser and the Node
 * scripts each read the file's bytes their own way and hand them here. Everything
 * downstream sees only the contract of `model.ts`.
 */
import { decodeCar } from "./format.ts";
import type { CarModel } from "./model.ts";

export * from "./model.ts";

/** The car model held in a `.car` file's bytes; throws when they are not one. */
export function loadCarModel(bytes: Uint8Array): CarModel {
  return decodeCar(bytes);
}
