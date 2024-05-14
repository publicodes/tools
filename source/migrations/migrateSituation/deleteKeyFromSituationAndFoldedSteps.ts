import { DottedName, Situation } from '../../../types/types'

export function deleteKeyFromSituationAndFoldedSteps({
  ruleName,
  situation,
  foldedSteps,
}: {
  ruleName: string
  situation: Situation
  foldedSteps: DottedName[]
}) {
  delete situation[ruleName]
  const index = foldedSteps?.indexOf(ruleName)

  if (index > -1) {
    foldedSteps.splice(index, 1)
  }
}
