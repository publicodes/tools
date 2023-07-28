/** @packageDocumentation

## Compile a model from a source

{@link getModelFromSource | `getModelFromSource`} allows to compile a set of Publicodes
files into a {@link index.RawRules | `RawRules`} that can be used by the Publicodes
{@link https://publi.codes/docs/api/core#new-enginerules | `Engine`}.

Note that it supports the `importer!` syntax to import other Publicodes rules from
NPM packages --
see {@link https://incubateur-ademe.github.io/publicodes-tools/modules/compilation.html#md:import-rules-from-a-npm-package | Imports rules from a NPM package}.

### Usage

```typescript
import { getModelFromSource } from '@incubateur-ademe/publicodes-tools/compilation'

const model = getModelFromSource(
	'data\/**\/*.publicodes',
	['data/test/**'],
	{ verbose: true },
)
```

## Import rules from a NPM package

To import rules from a _packaged_ Publicodes model, you need to specify the following syntax :

```yaml
importer!:
  depuis: <npm_package_name>
  les règles:
    - <rule_name_from_the_npm_package>
    - <rule_name_from_the_npm_package>:
      <attr_to_overwrite>: <value>
      ...
    ...
```

When compiling , each YAML entry `importer!` will be replaced by all imported rules and
their dependencies by {@link getModelFromSource | `getModelFromSource`}.

> NOTE: to be used in the `importer!` meta-mechanism, the NPM package need to expose the
compiled {@link index.RawRules | `RawRules`} into `<package_name>.model.json`.

*/
export * from './getModelFromSource'
