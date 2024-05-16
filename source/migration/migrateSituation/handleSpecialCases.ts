import { DottedName, Situation } from '../migrateSituation'

type Props = {
  ruleName: DottedName
  // Should be fixed
  nodeValue: any
  situation: Situation
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
 * @param ruleName - The name of the rule.
 * @param nodeValue - The node value.
 * @param situation - The situation object.
 * @returns - The updated situation object.
 */
export function handleSpecialCases({ ruleName, nodeValue, situation }: Props) {
  const situationUpdated = { ...situation }

  // Special case, number store as a string, we have to convert it to a number
  if (
    nodeValue &&
    typeof nodeValue === 'string' &&
    !isNaN(parseFloat(nodeValue))
  ) {
    situationUpdated[ruleName] = parseFloat(nodeValue)
  }

  // Special case : wrong value format, legacy from previous publicodes version
  // handle the case where valeur is a string "2.33"
  if (nodeValue && nodeValue.valeur !== undefined) {
    situationUpdated[ruleName] =
      typeof nodeValue.valeur === 'string' &&
      !isNaN(parseFloat(nodeValue.valeur))
        ? parseFloat(nodeValue.valeur)
        : (nodeValue.valeur as number)
  }
  // Special case : other wrong value format, legacy from previous publicodes version
  // handle the case where nodeValue is a string "2.33"
  if (nodeValue && nodeValue.nodeValue !== undefined) {
    situationUpdated[ruleName] =
      typeof nodeValue.nodeValue === 'string' &&
      !isNaN(parseFloat(nodeValue.nodeValue))
        ? parseFloat(nodeValue.nodeValue)
        : (nodeValue.nodeValue as number)
  }

  return situationUpdated
}
