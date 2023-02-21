<div align="center">
  <h3 align="center">
	<big>Publiopti</big>
  </h3>
  <p align="center">
   <a href="https://github.com/datagir/publiopti/issues">Report Bug</a>
   •
   <a href="https://github.com/datagir/publiopti/blob/master/CONTRIBUTING.md">Contribute</a>
   •
   <a href="https://publi.codes">Publicodes</a>
  </p>

![CI][ci-link] ![NPM][npm-link]

 `publiopti` is a set of optimisation passes for models based on [Publicodes](https://publi.codes).

 :warning: <i>The project is currently in under experimentation by the [Nos Gestes Climat](https://github.com/datagir/nosgestesclimat-site) team.</i> :warning:

</div>

## Why?

Publicodes based projects are built [_by
design_](https://publi.codes/docs/pourquoi-publicodes/standard-modeles-ouverts#document%C3%A9s-sourc%C3%A9s)
to be fully transparent and intelligible for the most people. This means to be
open-source, but especially to be as detailed as possible in the calculation.

Consequently, a severe complexity of the models start to appears. However, this complexity
is only justified for the documentation not for the computation/simulation it self.

For example, considering the following rule
[`alimentation . déchets . niveau
moyen`](https://github.com/datagir/nosgestesclimat/blob/master/data/services%20soci%C3%A9taux/services%20publics.yaml):

```yaml
alimentation . déchets . niveau moyen:
  formule:
    somme:
      - omr
      - collecte separee
      - dechetterie
      - gestes
  description: |
    Ce niveau correspond à la moyenne française.
```

This rule allows to compute the average level of food waste produced by a
French person. This value doesn't depend on any user inputs: it's the same for
every simulation. Therefore, it's possible to compute the value
at compile time and to simplify the model used by the browser.

## Installation

```
npm install --dev-dependency publiopti

yarn add -D publiopti
```

## Usage

```typescript
import Engine from 'publicodes'
import { constantFolding, getRawNodes } from 'publiopti'

const optimizedRules = constantFolding(
  // A publicode engine instantiated with the rules to optimize.
  new Engine(baseRules),
  // A predicate returning true if the rule needs to be kept.
  ([ruleName, ruleNode]) => {
    return ['root', 'root . bis'].includes(ruleName) ||  ruleNode.rawNode['to keep']
  }
)
```
## Under the hood

Currently, only one optimisation pass is available: the constant folding one.

Constant folding consists in calculating at compile time the value of an
expression and replacing them in all its references. After this step, if a rule
is no longer used by any other rules, it's deleted -- unless the `toKeep`
attribute is provided.

[ci-link]: https://github.com/datagir/publiopti/actions/workflows/build.yml/badge.svg
[npm-link]: https://img.shields.io/npm/v/publiopti
