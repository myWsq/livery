/** Reads the car the workshop shows from the repository, in Node. */
import { readFileSync } from "node:fs";

import { loadCarModel, type CarModel } from "../../src/car/index.ts";
import { REPOSITORY } from "./design.ts";

/** The car file, relative to the repository root; `scripts/import-car.ts` writes it. */
const CAR_FILE = "models/porsche-911.car";

export function readCarModel(): CarModel {
  return loadCarModel(readFileSync(`${REPOSITORY}${CAR_FILE}`));
}
