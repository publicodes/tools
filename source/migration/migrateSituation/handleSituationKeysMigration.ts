import {
  DottedName,
  MigrationType,
  NodeValue,
  Situation,
} from '../../../types/types'
import { deleteKeyFromSituationAndFoldedSteps } from './deleteKeyFromSituationAndFoldedSteps'

type Props = {
  ruleName: string
  nodeValue: NodeValue
  situation: Situation
  foldedSteps: DottedName[]
  migrationInstructions: MigrationType
}

/**
 * Updates a key in the situation object and foldedSteps.
 * @param ruleName - The name of the rule to update.
 * @param nodeValue - The new value for the rule.
 * @param situation - The situation object.
 * @param foldedSteps - The array of foldedSteps.
 * @param migrationInstructions - The migration instructions.
 */
function updateKeyInSituationAndFoldedSteps({
  ruleName,
  nodeValue,
  situation,
  foldedSteps,
  migrationInstructions,
}: {
  ruleName: string
  nodeValue: NodeValue
  situation: Situation
  foldedSteps: DottedName[]
  migrationInstructions: MigrationType
}) {
  situation[migrationInstructions.keysToMigrate[ruleName]] =
    (nodeValue as any)?.valeur ?? nodeValue

  delete situation[ruleName]

  const index = foldedSteps?.indexOf(ruleName)

  if (index > -1) {
    foldedSteps[index] = migrationInstructions.keysToMigrate[ruleName]
  }
}

/**
 * Updates a key in the situation and foldedSteps based on migration instructions.
 * If the key is not a key to migrate but a key to delete, it will be removed from the situation and foldedSteps.
 * If the key is renamed and needs to be migrated, it will be updated in the situation and foldedSteps.
 *
 * @param ruleName - The name of the rule/key to update.
 * @param nodeValue - The new value for the rule/key.
 * @param situation - The current situation object.
 * @param foldedSteps - The current foldedSteps array.
 * @param migrationInstructions - The migration instructions object.
 *
 * @returns An object containing the migrated situation and foldedSteps.
 */
export function handleSituationKeysMigration({
  ruleName,
  nodeValue,
  situation,
  foldedSteps,
  migrationInstructions,
}: Props): { situationMigrated: Situation; foldedStepsMigrated: DottedName[] } {
  const situationMigrated = { ...situation }
  const foldedStepsMigrated = [...foldedSteps]

  // The key is not a key to migrate but a key to delete
  if (migrationInstructions.keysToMigrate[ruleName] === '') {
    deleteKeyFromSituationAndFoldedSteps({
      ruleName,
      situation: situationMigrated,
      foldedSteps: foldedStepsMigrated,
    })
    return { situationMigrated, foldedStepsMigrated }
  }

  if (!migrationInstructions.keysToMigrate[ruleName]) {
    return
  }

  // The key is renamed and needs to be migrated
  updateKeyInSituationAndFoldedSteps({
    ruleName,
    nodeValue,
    situation: situationMigrated,
    foldedSteps: foldedStepsMigrated,
    migrationInstructions,
  })

  return { situationMigrated, foldedStepsMigrated }
}
