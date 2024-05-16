import { DottedName, MigrationType, Situation } from './types'
import { getValueWithoutQuotes } from './migrateSituation/getValueWithoutQuotes'
import { handleSituationKeysMigration } from './migrateSituation/handleSituationKeysMigration'
import { handleSituationValuesMigration } from './migrateSituation/handleSituationValuesMigration'
import { handleSpecialCases } from './migrateSituation/handleSpecialCases'

/**
 * Migrate rules and answers from a situation which used to work with an old version of a model to a new version according to the migration instructions.
 *
 * @param {Object} options - The options object.
 * @param {Situation} options.situation - The `situation` as Publicodes object containing all answers for a given simulation.
 * @param {DottedName[]} [options.foldedSteps=[]] - In case of form app, an array containing answered questions.
 * @param {MigrationType} options.migrationInstructions - An object containing keys and values to migrate formatted as follows:
 *
 * @example
 * ```
 * {
 * keysToMigrate: {
 * oldKey: newKey
 * }
 * valuesToMigrate: {
 *   key: {
 *      oldValue: newValue
 * }
 * }
 * ```
 * An example can be found in {@link https://github.com/incubateur-ademe/nosgestesclimat/blob/preprod/migration/migration.yaml | nosgestesclimat repository}.
 * @returns {Object} The migrated situation (and foldedSteps if specified).
 */
export function migrateSituation({
  situation,
  foldedSteps = [],
  migrationInstructions,
}: {
  situation: Situation
  foldedSteps?: DottedName[]
  migrationInstructions: MigrationType
}) {
  let situationMigrated = { ...situation }
  let foldedStepsMigrated = [...foldedSteps]

  Object.entries(situationMigrated).map(([ruleName, nodeValue]) => {
    situationMigrated = handleSpecialCases({
      ruleName,
      nodeValue,
      situation: situationMigrated,
    })

    // We check if the non supported ruleName is a key to migrate.
    // Ex: "logement . chauffage . bois . type . bûche . consommation": "xxx" which is now ""logement . chauffage . bois . type . bûches . consommation": "xxx"
    if (Object.keys(migrationInstructions.keysToMigrate).includes(ruleName)) {
      const result = handleSituationKeysMigration({
        ruleName,
        nodeValue,
        situation: situationMigrated,
        foldedSteps: foldedStepsMigrated,
        migrationInstructions,
      })

      situationMigrated = result.situationMigrated
      foldedStepsMigrated = result.foldedStepsMigrated
    }

    const matchingValueToMigrateObject =
      migrationInstructions.valuesToMigrate[
        Object.keys(migrationInstructions.valuesToMigrate).find((key) =>
          ruleName.includes(key),
        ) as any
      ]

    const formattedNodeValue =
      getValueWithoutQuotes(nodeValue) || (nodeValue as string)

    if (
      // We check if the value of the non supported ruleName value is a value to migrate.
      // Ex: answer "logement . chauffage . bois . type": "bûche" changed to "bûches"
      // If a value is specified but empty, we consider it to be deleted (we need to ask the question again)
      // Ex: answer "transport . boulot . commun . type": "vélo"
      matchingValueToMigrateObject &&
      Object.keys(matchingValueToMigrateObject).includes(
        // If the string start with a ', we remove it along with the last character
        // Ex: "'bûche'" => "bûche"
        formattedNodeValue,
      )
    ) {
      const result = handleSituationValuesMigration({
        ruleName,
        nodeValue: formattedNodeValue,
        situation: situationMigrated,
        foldedSteps: foldedStepsMigrated,
        migrationInstructions,
      })

      situationMigrated = result.situationMigrated
      foldedStepsMigrated = result.foldedStepsMigrated
    }
  })

  return { situationMigrated, foldedStepsMigrated }
}
