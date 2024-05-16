import { DottedName, Situation } from '../types'

/**
 * Delete a key from the situation and from the foldedSteps if it exists.
 * @param ruleName - The rulename to delete.
 * @param situation - The situation object.
 * @param foldedSteps - The foldedSteps array.
 */
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
