/** @packageDocumentation

## Situation migration

### Why?

In time, the `publicodes` models evolve. When a model is updated (e.g. a rule
is renamed, a value is changed, a new rule is added, etc.), we want to ensure
that the previous situations (i.e. answers to questions) are still valid.

This is where the sitation migration comes in.

### Usage

{@link migrateSituation | `migrateSituation`} allows to migrate a siuation from
an old version of a model to a new version according to the provided _migration
instructions_.


```typescript
import { migrateSituation } from '@publicodes/tools/migration'

const oldSituation = {
  "age": 25
  "job": "developer",
}

// In the new model version, the rule `age` has been renamed to `âge` and the
// value `developer` has been translated to `développeur`.
const migrationInstructions = {
  keysToMigrate: { age: 'âge' }
  valuesToMigrate: {
    job: { developer: 'développeur' }
  }
}

console.log(migrateSituation(oldSituation, migrationInstructions))

// Output:
// {
//  "âge": 25,
//  "job": "développeur"
// }
```
*/

export * from './migrateSituation'
