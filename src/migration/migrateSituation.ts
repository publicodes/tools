import { Evaluation } from 'publicodes'
import { getValueWithoutQuotes, RuleName } from '../commons'

/**
 * A situation object containing all answers for a given simulation.
 */
export type Situation = Record<RuleName, Evaluation>

/**
 * Associate a old value to a new value.
 */
export type ValueMigration = Record<string, string>

/**
 * Migration instructions. It contains the rules and values to migrate.
 */
export type Migration = {
  rulesToMigrate: Record<RuleName, RuleName>
  valuesToMigrate: Record<RuleName, ValueMigration>
}

/**
 * Migrate a situation from an old version of a model to a new version
 * according to the provided migration instructions.
 *
 * @param situation - The situation object containing all answers for a given simulation.
 * @param instructions - The migration instructions object.
 *
 * @returns The migrated situation (and foldedSteps if specified).
 *
 * TODO: exemple of instructions (empty string for deletion, new key name for renaming, new value for updating)
 *
 * An example of instructions can be found {@link https://github.com/incubateur-ademe/nosgestesclimat/blob/preprod/migration/migration.yaml | here}.
 */
export function migrateSituation(
  situation: Situation,
  instructions: Migration,
): Situation {
  let newSituation = { ...situation }
  const currentRules = Object.keys(situation)
  const valueKeysToMigrate = Object.keys(instructions.valuesToMigrate)

  Object.entries(situation).map(([rule, value]) => {
    handleSpecialCases(rule, value, newSituation)

    if (currentRules.includes(rule)) {
      updateKey(rule, value, newSituation, instructions.rulesToMigrate[rule])
    }

    const formattedValue = getValueWithoutQuotes(value) ?? (value as string)
    const valuesMigration =
      instructions.valuesToMigrate[
        valueKeysToMigrate.find((key) => rule.includes(key))
      ] ?? {}
    const oldValuesName = Object.keys(valuesMigration)

    if (
      // We check if the value of the non supported ruleName value is a value to migrate.
      // Ex: answer "logement . chauffage . bois . type": "bûche" changed to "bûches"
      // If a value is specified but empty, we consider it to be deleted (we need to ask the question again)
      // Ex: answer "transport . boulot . commun . type": "vélo"
      oldValuesName.includes(formattedValue)
    ) {
      updateValue(rule, valuesMigration[formattedValue], newSituation)
    }
  })

  return newSituation
}

// Handle migration of old value format : an object { valeur: number, unité: string }
/**
 * Handles special cases during the migration of old value formats.
 *
 * @example
 * ````
{ valeur: number, unité: string }
```
 *
 * @param rule - The name of the rule.
 * @param oldValue - The node value.
 * @param situation - The situation object.
 * @returns - The updated situation object.
 */
function handleSpecialCases(
  rule: RuleName,
  oldValue: Evaluation,
  situation: Situation,
): void {
  // Special case, number store as a string, we have to convert it to a number
  if (
    oldValue &&
    typeof oldValue === 'string' &&
    !isNaN(parseFloat(oldValue))
  ) {
    situation[rule] = parseFloat(oldValue)
  }

  // Special case : wrong value format, legacy from previous publicodes version
  // handle the case where valeur is a string "2.33"
  if (oldValue && oldValue['valeur'] !== undefined) {
    situation[rule] =
      typeof oldValue['valeur'] === 'string' &&
      !isNaN(parseFloat(oldValue['valeur']))
        ? parseFloat(oldValue['valeur'])
        : (oldValue['valeur'] as number)
  }
  // Special case : other wrong value format, legacy from previous publicodes version
  // handle the case where nodeValue is a string "2.33"
  if (oldValue && oldValue['nodeValue'] !== undefined) {
    situation[rule] =
      typeof oldValue['nodeValue'] === 'string' &&
      !isNaN(parseFloat(oldValue['nodeValue']))
        ? parseFloat(oldValue['nodeValue'])
        : (oldValue['nodeValue'] as number)
  }
}

/**
 */
function updateKey(
  rule: RuleName,
  oldValue: Evaluation,
  situation: Situation,
  ruleToMigrate: RuleName | undefined,
): void {
  if (ruleToMigrate === undefined) {
    return
  }

  delete situation[rule]

  if (ruleToMigrate !== '') {
    situation[ruleToMigrate] =
      typeof oldValue === 'object' ? (oldValue as any)?.valeur : oldValue
  }
}

/**
 */
export function updateValue(
  rule: RuleName,
  value: string,
  situation: Situation,
): void {
  // The value is not a value to migrate and the key has to be deleted
  if (value === '') {
    delete situation[rule]
  } else {
    // The value is renamed and needs to be migrated
    situation[rule] = getMigratedValue(value)
  }
}

function getMigratedValue(value: string): string {
  if (typeof value === 'string' && value !== 'oui' && value !== 'non') {
    return `'${value}'`
  }

  // FIXME: I'm not sure if it's necessary to check if the value is a number,
  // as valuesToMigrate is a ValueMigration object (Record<string, string>).
  // Is it possible to have objects in valuesToMigrate?
  // if (
  //   (
  //     value as unknown as {
  //       valeur: number
  //     }
  //   )?.valeur !== undefined
  // ) {
  //   return (
  //     value as unknown as {
  //       valeur: number
  //     }
  //   ).valeur as unknown as string
  // }

  return value
}
