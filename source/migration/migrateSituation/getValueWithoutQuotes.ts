import { NodeValue } from '../types'

/**
 * Returns the value without quotes if it is a string.
 * @param value - The value to parse.
 *
 * @returns The value without quotes if it is a string, null otherwise.
 */
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
