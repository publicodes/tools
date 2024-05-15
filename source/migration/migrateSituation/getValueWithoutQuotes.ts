import { NodeValue } from '../../../types/types'

export function getValueWithoutQuotes(value: NodeValue) {
  if (
    typeof value !== 'string' ||
    !value.startsWith("'") ||
    value === 'oui' ||
    value === 'non'
  ) {
    return null
  }
  return value.slice(1, -1)
}
