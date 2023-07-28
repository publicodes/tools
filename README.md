<div align="center">
  <h3 align="center">
	<big>publicodes-tools</big>
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

 `publicodes-tools` is a set of utility functions that could be used to easily write 
    tooling around [Publicodes](https://publi.codes) models.

 :warning: <i>The project is currently in under experimentation and maintained
     by the nosgestesclimat.fr team.</i> :warning:

</div>

## Installation

```
npm install --dev-dependency publicodes-tools

yarn add -D publicodes-tools 
```

## Usage in local

When developing in local:

1. you can link the local package with `yarn link`, 
2. launch the compilation in watch mode with `yarn watch`,
3. and use it in your project with `yarn link publicodes-tools`.

## Compilation

To know how to easily compile Publicodes model into a standalone JSON file, see
the [dedicated doc
page](https://incubateur-ademe.github.io/publicodes-tools/modules/compilation.html).

## Optimizations passes

To know how to optimized a Publicodes model to computation, see the [dedicated
doc page](https://incubateur-ademe.github.io/publicodes-tools/modules/optims.html).


[ci-link]: https://github.com/datagir/publiopti/actions/workflows/build.yml/badge.svg
[npm-link]: https://img.shields.io/npm/v/publiopti
