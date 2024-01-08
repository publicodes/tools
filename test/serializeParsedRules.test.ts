import Engine from 'publicodes'
import { serializeParsedRules } from '../source/index'

describe('serializeParsedRules', () => {
  it('should serialize empty rules', () => {
    expect(serializeParsedRules({})).toStrictEqual({})
  })

  it('should serialize simple rule with one mecanism', () => {
    const rules = {
      rule: {
        titre: 'My rule',
        valeur: 10,
      },
    }
    expect(
      serializeParsedRules(new Engine(rules).getParsedRules()),
    ).toStrictEqual(rules)
  })
})
