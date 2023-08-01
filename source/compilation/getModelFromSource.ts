import glob from 'glob'
import yaml from 'yaml'
import { readFileSync } from 'fs'
import Engine, { Rule, RuleNode } from 'publicodes'
import { getAllRefsInNode, RawRules, RuleName } from '../commons'
import { dirname, join } from 'path'

/**
 * @fileOverview Functions to aggregate all .publicodes files into a single standalone JSON object where
 * all imports are resolved.
 * @requires publicodes
 */

const IMPORT_KEYWORD = 'importer!'

/**
 * Represents a macro that allows to import rules from another package.
 *
 * @example
 * ```yaml
 * importer!:
 *  depuis:
 *    nom: 'mif-macro'
 *    source: 'mif-macro.model.yaml'
 *  les règles:
 *    - mif-macro . règle 1
 *    - mif-macro . règle 2:
 *      question: 'Quelle est la valeur de la règle 2 ?'
 */
export type ImportMacro = {
  depuis: {
    // The name of the package to import the rules from.
    nom: string
    // The path to the file containing the rules to import. If omitted try to
    // found the file in the `node_modules` folders.
    source?: string
    // The URL of the package, used for the documentation.
    url?: string
  }
  // List of rules to import from the package.
  // They could be specified by their name, or by the name and the list of
  // properties to override or add.
  'les règles': [string | object][]
}

export type GetModelFromSourceOptions = {
  ignore?: string | string[]
  verbose?: boolean
}

/**
 * @param {string} packageName - The package name.
 *
 * @returns {string} The path to the package model in the node_modules folder.
 */
const packageModelPath = (packageName: string): string =>
  `node_modules/${packageName}/${packageName}.model.json`

// Stores engines initialized with the rules from package
const enginesCache = {}

/**
 * Returns an instance of the publicodes engine initialized with the rules from the given file.
 *
 * @param filePath - The path to the file containing the rules in a JSON format.
 * @param opts - Options.
 */
function getEngine(
  filePath: string,
  { depuis }: ImportMacro,
  opts: GetModelFromSourceOptions,
): Engine {
  const packageName = depuis.nom
  const fileDirPath = dirname(filePath)

  if (!enginesCache[packageName]) {
    if (opts?.verbose) {
      console.debug(` 📦 '${packageName}' loading`)
    }
    try {
      const engine = new Engine(
        JSON.parse(
          readFileSync(
            join(fileDirPath, depuis.source) ?? packageModelPath(packageName),
            'utf-8',
          ),
        ),
        {
          logger: {
            log: (_) => {},
            warn: (_) => {},
            error: (s) => console.error(s),
          },
        },
      )
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
function getRuleToImportInfos(ruleToImport: string | object): {
  ruleName: string
  attrs: object
} {
  if (typeof ruleToImport == 'object') {
    console.log('ruleToImport', ruleToImport)
    const entries = Object.entries(ruleToImport)
    const ruleName = entries[0][0]
    return { ruleName, attrs: Object.fromEntries(entries.slice(1)) }
  }

  return { ruleName: ruleToImport, attrs: {} }
}

function addSourceModelInfomation(
  importInfos: ImportMacro,
  importedRule: Rule,
) {
  const { nom, url } = importInfos.depuis
  const linkToSourceModel = url
    ? `> Cette règle provient du modèle [${nom}](${url}).`
    : `> Cette règle provient du modèle **${nom}**.`

  return {
    ...importedRule,
    description: importedRule.description
      ? `
${linkToSourceModel}


${importedRule.description}`
      : linkToSourceModel,
  }
}

/**
 * @throws {Error} If the `nom` attribute is different from the `ruleNameToCheck`.
 */
function removeRawNodeNom(
  rawNode: Rule,
  ruleNameToCheck: string,
): Omit<Rule, 'nom'> {
  const { nom, ...rest } = rawNode
  if (nom !== ruleNameToCheck)
    throw Error(
      `Imported rule's publicode raw node "nom" attribute is different from the resolveImport script ruleName. Please investigate`,
    )
  return rest
}

/**
 * @throws {Error} If the rule to import does not exist.
 * @throws {Error} If there is double definition of a rule.
 * @throws {Error} If the imported rule's publicode raw node "nom" attribute is different from the resolveImport script ruleName.
 */
function resolveImports(
  filePath: string,
  rules: object,
  opts: GetModelFromSourceOptions,
): object {
  const resolvedRules = Object.entries(rules).reduce((acc, [name, value]) => {
    if (name === IMPORT_KEYWORD) {
      const importMacro: ImportMacro = value
      const engine = getEngine(filePath, importMacro, opts)
      const rulesToImport = importMacro['les règles']

      rulesToImport?.forEach((ruleToImport: string | object) => {
        const { ruleName, attrs } = getRuleToImportInfos(ruleToImport)
        if (acc.find(([accRuleName, _]) => accRuleName === ruleName)) {
          throw new Error(
            `La règle '${ruleName}' est définie deux fois dans ${importMacro.depuis.nom}`,
          )
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
          return [
            ruleName,
            removeRawNodeNom(ruleWithUpdatedDescription, ruleName),
          ]
        }

        const ruleWithOverridenAttributes = { ...rule.rawNode, ...attrs }

        acc.push(getUpdatedRule(ruleName, ruleWithOverridenAttributes))
        const ruleDeps = getDependencies(engine, rule)
          .filter(([ruleDepName, _]) => {
            // Avoid to overwrite the updatedRawNode
            return !acc.find(([accRuleName, _]) => accRuleName === ruleDepName)
          })
          .map(([ruleName, ruleNode]) => {
            return getUpdatedRule(ruleName, ruleNode)
          })
        acc.push(...ruleDeps)
      })
    } else {
      acc.push([name, value])
    }
    return acc
  }, [])
  return Object.fromEntries(resolvedRules)
}

/**
 * Aggregates all rules from the rules folder into a single json object (the model)
 * with the resolved dependencies.
 *
 * @param sourceFile - Pattern to match the source files to be included in the model.
 * @param ignore - Pattern to match the source files to be ignored in the model.
 * @param opts - Options.
 *
 * @returns The model with resolved imports in a single JSON object.
 *
 * @throws {Error} If the rule to import does not exist.
 * @throws {Error} If there is double definition of a rule.
 */
export function getModelFromSource(
  sourceFile: string,
  opts?: GetModelFromSourceOptions,
): RawRules {
  const res = glob
    .sync(sourceFile, { ignore: opts?.ignore })
    .reduce((jsonModel: object, filePath: string) => {
      const rules = yaml.parse(readFileSync(filePath, 'utf-8'))
      const completeRules = resolveImports(filePath, rules, opts)
      return { ...jsonModel, ...completeRules }
    }, {})
  return res
}
