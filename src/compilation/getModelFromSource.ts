import { readFileSync, statSync } from 'fs'
import { sync } from 'glob'
import yaml from 'yaml'
import { getDoubleDefError, RawRules, RuleName } from '../commons'
import { resolveImports } from './resolveImports'

export type GetModelFromSourceOptions = {
  ignore?: string | string[]
  verbose?: boolean
}

function throwErrorIfDuplicatedRules(
  filePath: string,
  rules: RawRules,
  newRules: RawRules,
) {
  Object.keys(newRules).forEach((rule) => {
    if (rule in rules) {
      throw getDoubleDefError(filePath, rule, rules[rule], newRules[rule])
    }
  })
}

/**
 * Aggregates all rules from the rules folder into a single json object (the model)
 * with the resolved dependencies.
 *
 * @param sourcePath - Path to the source files, can be a glob pattern.
 * @param ignore - Pattern to match the source files to be ignored in the model.
 * @param opts - Options.
 *
 * @returns The model with resolved imports in a single JSON object.
 *
 * @throws {Error} If the package name is missing in the macro.
 * @throws {Error} If the rule to import does not exist.
 * @throws {Error} If there is double definition of a rule.
 * @throws {Error} If there is a conflict between an imported rule and a base rule.
 */
export function getModelFromSource(
  sourcePath: string,
  opts?: GetModelFromSourceOptions,
): RawRules {
  try {
    if (statSync(sourcePath).isDirectory()) {
      sourcePath = sourcePath + '/**/*.publicodes'
    }
  } catch (e) {}
  const { jsonModel, namespaces } = sync(sourcePath, {
    ignore: opts?.ignore,
  }).reduce(
    ({ jsonModel, namespaces }, filePath: string) => {
      const rules: RawRules = yaml.parse(readFileSync(filePath, 'utf-8'))
      if (rules == null) {
        console.warn(`⚠️ ${filePath} is empty, skipping...`)
        return { jsonModel, namespaces }
      }
      const { completeRules, neededNamespaces } = resolveImports(
        filePath,
        rules,
        opts?.verbose,
      )
      // PERF: could be smarter?
      throwErrorIfDuplicatedRules(filePath, jsonModel, completeRules)
      return {
        jsonModel: { ...jsonModel, ...completeRules },
        namespaces: new Set([...namespaces, ...neededNamespaces]),
      }
    },
    { jsonModel: {}, namespaces: new Set<RuleName>() },
  )
  namespaces.forEach((namespace: RuleName) => {
    if (jsonModel[namespace] === undefined) {
      jsonModel[namespace] = null
    }
  })

  return jsonModel
}
