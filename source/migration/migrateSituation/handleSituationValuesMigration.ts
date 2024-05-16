import { DottedName, MigrationType, NodeValue, Situation } from '../types'
import { deleteKeyFromSituationAndFoldedSteps } from './deleteKeyFromSituationAndFoldedSteps'

type Props = {
  ruleName: DottedName
  nodeValue: NodeValue
  situation: Situation
  foldedSteps: DottedName[]
  migrationInstructions: MigrationType
}

/**
 * Get the migrated value.
 *
 * @param ruleName - The name of the rule to update.
 * @param nodeValue - The new value for the rule.
 * @param migrationInstructions - The migration instructions.
 */
function getMigratedValue({
  ruleName,
  nodeValue,
  migrationInstructions,
}: {
  ruleName: DottedName
  nodeValue: NodeValue
  migrationInstructions: MigrationType
}): NodeValue {
  if (
    typeof migrationInstructions.valuesToMigrate[ruleName][
      nodeValue as string
    ] === 'string' &&
    migrationInstructions.valuesToMigrate[ruleName][nodeValue as string] !==
      'oui' &&
    migrationInstructions.valuesToMigrate[ruleName][nodeValue as string] !==
      'non'
  ) {
    return `'${migrationInstructions.valuesToMigrate[ruleName][nodeValue as string]}'`
  }

  if (
    (
      migrationInstructions.valuesToMigrate[ruleName][nodeValue as string] as {
        valeur: number
      }
    )?.valeur !== undefined
  ) {
    return (
      migrationInstructions.valuesToMigrate[ruleName][nodeValue as string] as {
        valeur: number
      }
    ).valeur
  }

  return migrationInstructions.valuesToMigrate[ruleName][
    nodeValue as string
  ] as string | number
}

/**
 * Handles the migration of situation values based on the provided migration instructions.
 *
 * @param ruleName - The name of the rule/key to update.
 * @param nodeValue - The new value for the rule/key.
 * @param situation - The current situation object.
 * @param foldedSteps - The current foldedSteps array.
 * @param migrationInstructions - The migration instructions object.
 *
 * @returns An object containing the migrated situation and foldedSteps.
 */
export function handleSituationValuesMigration({
  ruleName,
  nodeValue,
  situation,
  foldedSteps,
  migrationInstructions,
}: Props): { situationMigrated: Situation; foldedStepsMigrated: DottedName[] } {
  if (!migrationInstructions.valuesToMigrate[ruleName]) {
    return
  }

  const situationMigrated = { ...situation }
  const foldedStepsMigrated = [...foldedSteps]

  // The value is not a value to migrate and the key has to be deleted
  if (
    migrationInstructions.valuesToMigrate[ruleName][nodeValue as string] === ''
  ) {
    deleteKeyFromSituationAndFoldedSteps({
      ruleName,
      situation: situationMigrated,
      foldedSteps: foldedStepsMigrated,
    })

    return { situationMigrated, foldedStepsMigrated }
  }

  // The value is renamed and needs to be migrated
  situationMigrated[ruleName] = getMigratedValue({
    ruleName,
    nodeValue,
    migrationInstructions,
  })

  return { situationMigrated, foldedStepsMigrated }
}
