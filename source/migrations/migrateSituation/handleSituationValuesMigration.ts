import {
  DottedName,
  MigrationType,
  NodeValue,
  Situation,
} from '../../../types/types'
import { deleteKeyFromSituationAndFoldedSteps } from './deleteKeyFromSituationAndFoldedSteps'

type Props = {
  ruleName: DottedName
  nodeValue: NodeValue
  situation: Situation
  foldedSteps: DottedName[]
  migrationInstructions: MigrationType
}

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
