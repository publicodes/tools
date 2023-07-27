import glob from 'glob'
import yaml from 'yaml'
import { readFileSync } from 'fs'
import Engine, { Rule, RuleNode } from 'publicodes'
import { RawRules } from '../commons'

/**
 * @fileOverview Functions to aggregate all .publicodes files into a single standalone JSON object where
 * all imports are resolved.
 * @requires publicodes
 */

const IMPORT_KEYWORD = 'importer!'
const FROM_KEYWORD = 'depuis'
const RULES_KEYWORD = 'les règles'

export type GetModelFromSourceOptions = {
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
 * @param {string} packageName - The package name.
 * @param {GetModelFromSourceOptions} opts - Options.
 *
 * @returns {Engine} The instanciated engine.
 */
function getEngine(
  packageName: string,
  opts: GetModelFromSourceOptions,
): Engine {
  if (!enginesCache[packageName]) {
    if (opts?.verbose) {
      console.debug(` 📦 '${packageName}' loading`)
    }
    try {
      const engine = new Engine(
        JSON.parse(readFileSync(packageModelPath(packageName), 'utf-8')),
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

// FixMe acc should't contain duplicates
function getDependencies(engine: Engine, rule: RuleNode, acc = []) {
  const deps = Array.from(
    engine.baseContext.referencesMaps.referencesIn.get(rule.dottedName),
  ).filter(
    (depRuleName) =>
      !depRuleName.endsWith('$SITUATION') &&
      !acc.find(([accRuleName, _]) => accRuleName === depRuleName),
  )
  if (deps.length === 0) {
    return acc
  }
  acc.push(...deps.map((dep) => [dep, engine.getRule(dep).rawNode]))
  return deps.flatMap((varName) => {
    return getDependencies(engine, engine.getRule(varName), acc)
  })
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
 *	 depuis: 'package-name'
 *	 les règles:
 *			- ruleA
 *			- ruleB:
 *			  attr1: value1
 * ```
 *
 * We have:
 * - getRuleToImportInfos('ruleA') -> [['ruleA', {}]]
 * - getRuleToImportInfos({'ruleB': {attr1: value1}) -> [['ruleA', {attr1: value1}]]
 */
function getRuleToImportInfos(
  ruleToImport: string | object,
): [string, object][] {
  if (typeof ruleToImport == 'object') {
    const entries = Object.entries(ruleToImport)
    return entries
  }
  return [[ruleToImport, {}]]
}

// TODO: Change dynamically imported model source across `depuis` attribute
function addSourceModelInfomation(importedRule: Rule) {
  const linkToSourceModel =
    '> Cette règle provient du modèle [Futureco-data](https://github.com/laem/futureco-data).'
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
 * @throws {Error} If the imported rule's publicode raw node "nom" attribute is different from the resolveImport script ruleName.
 */
function resolveImports(
  rules: object,
  opts: GetModelFromSourceOptions,
): object {
  const resolvedRules = Object.entries(rules).reduce((acc, [name, value]) => {
    if (name === IMPORT_KEYWORD) {
      const engine = getEngine(value[FROM_KEYWORD], opts)
      const rulesToImport = value[RULES_KEYWORD]

      rulesToImport?.forEach((ruleToImport: string | object) => {
        const [[ruleName, attrs]] = getRuleToImportInfos(ruleToImport)
        const rule = engine.getRule(ruleName)
        if (!rule) {
          throw new Error(
            `La règle '${ruleName}' n'existe pas dans ${value[FROM_KEYWORD]}`,
          )
        }
        const updatedRawNode = { ...rule.rawNode, ...attrs }
        // The name "nom" will already be there as the key, also called dottedName or ruleName
        // Keeping it is a repetition and can lead to misleading translations (rule names should not be translated in the current state of translation, they're the ids)
        acc.push([ruleName, removeRawNodeNom(updatedRawNode, ruleName)])
        const ruleDeps = getDependencies(engine, rule)
          .filter(
            ([ruleDepName, _]) =>
              // Avoid to overwrite the updatedRawNode
              !acc.find(([accRuleName, _]) => accRuleName === ruleDepName),
          )
          .map(([k, v]) => {
            const ruleWithoutName = removeRawNodeNom(v, k)
            return [k, ruleWithoutName]
          })
          .map(([k, v]) => {
            const ruleWithUpdatedDescription = addSourceModelInfomation(v)
            return [k, ruleWithUpdatedDescription]
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
 */
export function getModelFromSource(
  sourceFile: string,
  ignore: string | string[] | undefined,
  opts: GetModelFromSourceOptions,
): RawRules {
  const res = glob
    .sync(sourceFile, { ignore })
    .reduce((jsonModel: object, filePath: string) => {
      try {
        const rules = yaml.parse(readFileSync(filePath, 'utf-8'))
        const completeRules = resolveImports(rules, opts)
        return { ...jsonModel, ...completeRules }
      } catch (e) {
        console.error(`Error parsing '${filePath}':`, e)
        return jsonModel
      }
    }, {})
  return res
}
