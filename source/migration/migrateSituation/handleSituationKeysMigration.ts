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
