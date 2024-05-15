export function getValueWithoutQuotes(value: string | number) {
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
