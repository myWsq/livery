/**
 * The car the workshop shows. This is the one place that names a concrete model:
 * swap the model here and everything else follows through the contract.
 */
import type { CarModel } from "./model.ts";
import { createPlaceholderCar } from "./placeholder.ts";

export * from "./model.ts";

export function loadCarModel(): CarModel {
  return createPlaceholderCar();
}
