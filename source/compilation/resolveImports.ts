import Engine, { Rule, RuleNode, utils } from 'publicodes'
import {
  RuleName,
  getAllRefsInNode,
  RawRules,
  ImportMacro,
  RuleImportWithOverridenAttrs,
  IMPORT_KEYWORD,
  getDoubleDefError,
} from '../commons'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'

/**
 * @param {string} packageName - The package name.
 *
 * @returns {string} The path to the package model in the node_modules folder.
 */
const packageModelPath = (packageName: string): string => {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/')
    return `./node_modules/${scope}/${name}/${name}.model.json`
  }
  return `./node_modules/${packageName}/${packageName}.model.json`
}

// Stores engines initialized with the rules from package
const enginesCache = {}

/**
 * Returns an instance of the publicodes engine initialized with the rules from the given file.
 *
 * @param filePath - The path to the file containing the rules in a JSON format.
 * @param opts - Options.
 *
 * @throws {Error} If the package name is missing in the macro.
 */
function getEngine(
  filePath: string,
  { depuis }: ImportMacro,
  verbose: boolean,
): Engine {
  const packageName = depuis.nom
  const fileDirPath = dirname(filePath)

  if (packageName === undefined) {
    throw new Error(
      `Le nom du package est manquant dans la macro 'importer!' dans le fichier: ${filePath}`,
    )
  }

  if (!enginesCache[packageName]) {
    try {
      const modelPath =
        depuis.source !== undefined
          ? join(fileDirPath, depuis.source)
          : packageModelPath(packageName)
      const model = JSON.parse(readFileSync(modelPath, 'utf-8'))
      const engine = new Engine(model, {
        logger: {
          log: (_) => {},
          warn: (_) => {},
          error: (s) => console.error(s),
        },
      })

      if (verbose) {
        console.debug(`📦 ${packageName} loaded`)
      }
      enginesCache[packageName] = engine
    } catch (e) {
      console.error(`Error when loading '${packageName}': ${e}`)
    }
  }

  return enginesCache[packageName]
}

function getDependencies(engine: Engine, rule: RuleNode, acc = []) {
  const refsIn = getAllRefsInNode({
    ...rule,
    // Remove the parents as it is not needed to get the dependencies of.
    explanation: { ...rule.explanation, parents: [] },
  })

  let deps = Array.from(refsIn ?? []).filter((depRuleName) => {
    return (
      !depRuleName.endsWith('$SITUATION') &&
      !acc.find(([accRuleName, _]) => accRuleName === depRuleName)
    )
  })

  if (deps.length === 0) {
    return acc
  }

  acc.push(...deps.map((depName) => [depName, engine.getRule(depName).rawNode]))
  deps.forEach((depName) => {
    acc = getDependencies(engine, engine.getRule(depName), acc)
  })

  return acc
}

type RuleToImport = {
  ruleName: RuleName
  attrs: object
}

/**
 * Returns the rule name and its attributes.
 *
 * @param ruleToImport - An item of the `les règles` array
 * @returns The rule name and its attributes ([string, object][])
 *
 * For example, for the following `importer!` rule:
 *
 * ```
 * importer!:
 *	 depuis:
 *	 	nom: 'package-name'
 *	 les règles:
 *			- ruleA
 *			- ruleB:
 *			  attr1: value1
 * ```
 *
 * We have:
 * - getRuleToImportInfos('ruleA')
 *   -> { ruleName: 'ruleA', attrs: {} }
 * - getRuleToImportInfos({'ruleB': null, attr1: value1})
 *   -> { ruleName: 'ruleB', attrs: {attr1: value1} }
 */
function getRuleToImportInfos(
  ruleToImport: RuleName | RuleImportWithOverridenAttrs,
): RuleToImport {
  if (typeof ruleToImport == 'object') {
    const ruleName = Object.keys(ruleToImport)[0]
    return { ruleName, attrs: ruleToImport[ruleName] }
  }
  return { ruleName: ruleToImport, attrs: {} }
}

function addSourceModelInfomation(
  importInfos: ImportMacro,
  importedRule: Rule,
) {
  const { nom, url } = importInfos.depuis
  const linkToSourceModel = url
    ? `> ℹ️ Cette règle provient du modèle [\`${nom}\`](${url}).`
    : `> ℹ️ Cette règle provient du modèle \`${nom}\`.`

  return {
    ...importedRule,
    description: importedRule.description
      ? `
${linkToSourceModel}


${importedRule.description}`
      : linkToSourceModel,
  }
}

function appearsMoreThanOnce(
  rulesToImport: RuleToImport[],
  ruleName: RuleName,
): boolean {
  return (
    rulesToImport.filter(({ ruleName: name }) => name === ruleName).length > 1
  )
}

function accFind(acc: [string, Rule][], ruleName: RuleName): [string, Rule] {
  return acc.find(([accRuleName, _]) => accRuleName === ruleName)
}

function getNamespace({ dans, depuis: { nom } }: ImportMacro): string {
  if (dans) {
    return dans
  }
  return nom.startsWith('@') ? nom.split('/')[1] : nom
}

/**
 * Resolves the `importer!` macro inside a publicode file if any.
 *
 * @param filePath - The path of the publicode file.
 * @param rules - The rules of the publicode file.
 * @param verbose - If true, logs the imported packages.
 *
 * @returns The rules of the publicode file with the imported rules.
 *
 * @throws {Error} If the rule to import does not exist.
 * @throws {Error} If there is double definition of a rule.
 * @throws {Error} If the imported rule's publicode raw node "nom" attribute is different from the resolveImport script ruleName.
 */
export function resolveImports(
  filePath: string,
  rules: RawRules,
  verbose = false,
): { completeRules: RawRules; neededNamespaces: Set<string> } {
  let neededNamespaces = new Set<string>()
  const resolvedRules = Object.entries(rules).reduce((acc, [name, value]) => {
    if (name === IMPORT_KEYWORD) {
      const importMacro = value as ImportMacro
      const engine = getEngine(filePath, importMacro, verbose)
      const rulesToImport: RuleToImport[] =
        importMacro['les règles']?.map(getRuleToImportInfos)
      const namespace = getNamespace(importMacro)

      neededNamespaces.add(namespace)
      rulesToImport?.forEach(({ ruleName, attrs }) => {
        if (appearsMoreThanOnce(rulesToImport, ruleName)) {
          throw new Error(
            `La règle '${ruleName}' est définie deux fois dans ${importMacro.depuis.nom}`,
          )
        }
        if (accFind(acc, ruleName)) {
          return acc
        }

        let rule
        try {
          rule = engine.getRule(ruleName)
        } catch (e) {
          throw new Error(
            `La règle '${ruleName}' n'existe pas dans ${importMacro.depuis.nom}`,
          )
        }

        const getUpdatedRule = (ruleName: RuleName, rule: Rule) => {
          const ruleWithUpdatedDescription = addSourceModelInfomation(
            importMacro,
            rule,
          )
          utils
            .ruleParents(ruleName)
            .forEach((rule) => neededNamespaces.add(`${namespace} . ${rule}`))
          return [`${namespace} . ${ruleName}`, ruleWithUpdatedDescription]
        }

        const ruleWithOverridenAttributes = { ...rule.rawNode, ...attrs }

        acc.push(getUpdatedRule(ruleName, ruleWithOverridenAttributes))
        const ruleDeps = getDependencies(engine, rule)
          .filter(([ruleDepName, _]) => {
            // Avoid to overwrite the updatedRawNode
            return (
              !accFind(acc, ruleDepName) &&
              // The dependency is part of the rule to import so we don't want to handle it now
              !rulesToImport.find(({ ruleName: ruleToImportName }) => {
                const theDepIsARuleToImport =
                  ruleName !== ruleToImportName &&
                  ruleToImportName === ruleDepName
                return theDepIsARuleToImport
              })
            )
          })
          .map(([ruleName, ruleNode]) => {
            return getUpdatedRule(ruleName, ruleNode)
          })
        acc.push(...ruleDeps)
      })
    } else {
      let doubleDefinition = accFind(acc, name)
      if (doubleDefinition) {
        throw getDoubleDefError(filePath, name, doubleDefinition[1], value)
      }
      acc.push([name, value])
    }
    return acc
  }, [])
  return { completeRules: Object.fromEntries(resolvedRules), neededNamespaces }
}
