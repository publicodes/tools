import { DottedName, MigrationType, Situation } from '../../types/types'
import { handleSituationKeysMigration } from './migrateSituation/handleSituationKeysMigration'
import { handleSituationValuesMigration } from './migrateSituation/handleSituationValuesMigration'
import { handleSpecialCases } from './migrateSituation/handleSpecialCases'

type Props = {
  situation: Situation
  foldedSteps?: DottedName[]
  migrationInstructions: MigrationType
}

export function migrateSituation({
  situation,
  foldedSteps = [],
  migrationInstructions,
}: Props) {
  let situationMigrated = { ...situation }
  let foldedStepsMigrated = [...foldedSteps]

  Object.entries(situationMigrated).map(([ruleName, nodeValue]) => {
    const situationUpdated = handleSpecialCases({
      ruleName,
      nodeValue,
      situation: situationMigrated,
    })

    situationMigrated = situationUpdated

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
      typeof nodeValue === 'string' &&
      nodeValue.startsWith("'") &&
      nodeValue !== 'oui' &&
      nodeValue !== 'non'
        ? nodeValue.slice(1, -1)
        : (nodeValue as string)

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
