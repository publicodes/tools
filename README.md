<div align="center">
  <h3 align="center">
	<big><code>@incubateur-ademe/publicodes-tools</code></big>
  </h3>
  <p align="center">
   <a href="https://github.com/incubateur-ademe/publicodes-tools/issues">Report Bug</a>
   •
   <a href="https://incubateur-ademe.github.io/publicodes-tools/">API docs</a>
   •
   <a href="https://github.com/incubateur-ademe/publicodes-tools/blob/master/CONTRIBUTING.md">Contribute</a>
   •
   <a href="https://publi.codes">Publicodes</a>
  </p>

![CI][ci-link] ![NPM][npm-link]

Set of utility functions that could be used to easily write tooling around [Publicodes](https://publi.codes) models.

:warning: <i>The project is currently in under experimentation and maintained
by the nosgestesclimat.fr team.</i> :warning:

</div>

## Features

- 🏗️ Compiles your set of Publicodes files into a standalone JSON file - [[doc](https://incubateur-ademe.github.io/publicodes-tools/modules/compilation.html#md:compile-a-model-from-a-source)]
- 📦 Resolves import from external Publicodes models, from source and from published [NPM packages](https://www.npmjs.com/package/futureco-data) - [[doc](https://incubateur-ademe.github.io/publicodes-tools/modules/compilation.html#md:import-rules-from-a-npm-package)]
- 🪶 Pre-computes your model at compile time and reduces [the number of rules by ~65%](https://github.com/incubateur-ademe/nosgestesclimat/pull/1697) - [[doc](https://incubateur-ademe.github.io/publicodes-tools/modules/optims.html)]

## Installation

```
npm install --dev-dependency @incubateur-ademe/publicodes-tools

yarn add -D @incubateur-ademe/publicodes-tools
```

## Usage in local

When developing in local:

1. you can link the local package with `yarn link`,
2. launch the compilation in watch mode with `yarn watch`,
3. and use it in your project with `yarn link @incubateur-ademe/publicodes-tools`.

[ci-link]: https://img.shields.io/github/actions/workflow/status/incubateur-ademe/publicodes-tools/build.yml?logo=github&logoColor=white&label=build%20%26%20test
[npm-link]: https://img.shields.io/npm/v/%40incubateur-ademe%2Fpublicodes-tools?logo=npm&logoColor=white&color=salmon
