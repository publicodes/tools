import glob from 'glob'
import yaml from 'yaml'
import { readFileSync } from 'fs'
import { RawRules } from '../commons'
import { resolveImports } from './resolveImports'

export type GetModelFromSourceOptions = {
  ignore?: string | string[]
  verbose?: boolean
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
 * @throws {Error} If the package name is missing in the macro.
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
      if (rules == null) {
        console.warn(`⚠️ ${filePath} is empty, skipping...`)
        return jsonModel
      }
      const completeRules = resolveImports(filePath, rules, opts?.verbose)
      return { ...jsonModel, ...completeRules }
    }, {})
  return res
}
