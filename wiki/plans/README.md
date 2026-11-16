# Plans

Implementation plans, one file per requirement, named `YYYYMMDD-short-slug.md`.
Execute in the order listed unless a plan's `Depends on` says otherwise.

| Plan                                                                  | Outcome                                                               | Depends on                     | Status |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ | ------ |
| [20261116-workshop-main-chain](./20261116-workshop-main-chain.md)     | Preview the livery on a placeholder car, live from five SVG artboards | none                           | DONE   |
| [20261116-design-switching](./20261116-design-switching.md)           | Switch between designs with the view held still                       | 20261116-workshop-main-chain   | DONE   |
| [20261116-single-package](./20261116-single-package.md)               | One package at the repository root instead of a monorepo              | 20261116-design-switching      | DONE   |
| [20261116-lighting-environments](./20261116-lighting-environments.md) | See the livery under four real lighting environments                  | 20261116-single-package        | DONE   |
| [20261116-sharp-backdrop](./20261116-sharp-backdrop.md)               | A sharp backdrop behind the car                                       | 20261116-lighting-environments | DONE   |
