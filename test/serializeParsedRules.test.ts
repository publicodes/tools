import Engine from 'publicodes'
import { serializeParsedRules } from '../source/index'

describe('API > mecanisms list', () => {
  it('should serialize empty rules', () => {
    expect(serializeParsedRules({})).toStrictEqual({})
  })

  it('should serialize rule with constant [valeur]', () => {
    const rules = {
      rule: {
        titre: 'My rule',
        valeur: 10,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with ref [valeur]', () => {
    const rules = {
      rule: {
        titre: 'My rule',
        valeur: 10,
      },
      rule2: {
        titre: 'Rule with a ref',
        valeur: 'rule',
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with ref [applicable si]', () => {
    const rules = {
      rule: {
        'applicable si': 'rule2',
        valeur: 10,
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with condition [applicable si]', () => {
    const rules = {
      rule: {
        'applicable si': 'rule2 < 5',
        valeur: 10,
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with condition [non applicable si]', () => {
    const rules = {
      rule: {
        'non applicable si': 'rule2 < 5',
        valeur: 10,
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [est non défini]', () => {
    const rules = {
      rule: {
        'est non défini': 'rule2',
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [est défini]', () => {
    const rules = {
      rule: {
        'est défini': 'rule2',
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [est non applicable]', () => {
    const rules = {
      rule: {
        'est non applicable': 'rule2',
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [est applicable]', () => {
    const rules = {
      rule: {
        'est applicable': 'rule2',
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [une de ces conditions]', () => {
    const rules = {
      rule: {
        'une de ces conditions': ['rule2', 'rule2 < 5'],
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [toutes ces conditions]', () => {
    const rules = {
      rule: {
        'toutes ces conditions': ['rule2', 'rule2 < 5'],
      },
      rule2: {
        valeur: 20,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [produit]', () => {
    const rules = {
      volume: {
        produit: ['2.5 m', '3 m', '4 m'],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [produit] (without unit)', () => {
    const rules = {
      volume: {
        produit: [2.5, 3, 4],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [variations]', () => {
    const rules = {
      'taux réduit': {
        valeur: 'oui',
      },
      'taux majoré': {
        valeur: 'non',
      },
      'taux allocation familiales': {
        variations: [
          {
            si: 'taux réduit',
            alors: '3.45 %',
          },
          {
            si: 'taux majoré',
            alors: '10 %',
          },
          { sinon: '5.25 %' },
        ],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [somme]', () => {
    const rules = {
      exemple: {
        somme: ['15.89 €', '12 % * 14 €', '-20 €'],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [moyenne]', () => {
    const rules = {
      exemple: {
        moyenne: ['15.89 €', '12 % * 14 €', '-20 €'],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [le maximum de]', () => {
    const rules = {
      max: {
        'le maximum de': ['15.89 €', '12 % * 14 €', '-20 €'],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [le minimum de]', () => {
    const rules = {
      max: {
        'le minimum de': ['15.89 €', '12 % * 14 €', '-20 €'],
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [arrondi]', () => {
    const rules = {
      arrondi: {
        arrondi: 'oui',
        valeur: 10.5,
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [arrondi] (example 2)', () => {
    const rules = {
      arrondi: {
        arrondi: '2 décimales',
        valeur: '2 / 3',
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [contexte]', () => {
    const rules = {
      brut: {
        valeur: '2000 €',
      },
      cotisation: {
        valeur: 'brut * 20 %',
      },
      'cotisation pour un SMIC': {
        valeur: 'cotisation',
        contexte: {
          brut: '1500 €',
        },
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [contexte] applied to a [somme]', () => {
    const rules = {
      brut: {
        valeur: '2000 €',
      },
      cotisation: {
        valeur: 'brut * 20 %',
      },
      'cotisation pour un SMIC': {
        somme: ['cotisation'],
        contexte: {
          brut: '1500 €',
        },
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [barème]', () => {
    const rules = {
      'revenu imposable': {
        valeur: '54126 €',
      },
      'impôt sur le revenu': {
        barème: {
          assiette: 'revenu imposable',
          tranches: [
            { taux: '0 %', plafond: '9807 €' },
            { taux: '14 %', plafond: '27086 €' },
            { taux: '30 %', plafond: '72617 €' },
            { taux: '41 %', plafond: '153783 €' },
            { taux: '45 %' },
          ],
        },
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it("should serialize rule with [barème] and a custom 'multiplicateur'", () => {
    const rules = {
      'revenu imposable': {
        valeur: '54126 €',
      },
      'plafond sécurité sociale': {
        valeur: '41136 €',
      },
      'impôt sur le revenu': {
        barème: {
          assiette: 'revenu imposable',
          multiplicateur: 'plafond sécurité sociale',
          tranches: [
            { taux: '0 %', plafond: '9807 €' },
            { taux: '14 %', plafond: '27086 €' },
            { taux: '30 %', plafond: '72617 €' },
            { taux: '41 %', plafond: '153783 €' },
            { taux: '45 %' },
          ],
        },
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [taux progressif]', () => {
    const rules = {
      "chiffre d'affaires": {
        valeur: '30000 €/an',
      },
      plafond: {
        valeur: '3000 €/mois',
      },
      'taux de réduction de cotisation': {
        'taux progressif': {
          assiette: "chiffre d'affaires",
          multiplicateur: 'plafond',
          tranches: [
            { taux: '100 %', plafond: '75 %' },
            { taux: '0 %', plafond: '100 %' },
          ],
        },
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [abattement]', () => {
    const rules = {
      'revenu imposable simple': {
        valeur: '30000 €',
        abattement: '2000 €',
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [plancher]', () => {
    const rules = {
      'temperature mesurée': {
        valeur: '-500 °C',
        plancher: '-273.15 °C',
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [plafond]', () => {
    const rules = {
      'déduction fiscale': {
        valeur: '1300 €/mois',
        plafond: '200 €/mois',
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  it('should serialize rule with [durée]', () => {
    const rules = {
      "date d'embauche": {
        valeur: '14/04/2008',
      },
      "ancienneté en fin d'année": {
        durée: {
          depuis: "date d'embauche",
          "jusqu'à": '31/12/2020',
        },
      },
    }
    const serializedRules = serializeParsedRules(
      new Engine(rules).getParsedRules(),
    )
    expect(serializedRules).toStrictEqual(rules)
  })

  // TODO
  // it('should serialize rule with [unité]', () => {
  //   const rules = {
  //     "date d'embauche": {
  //       valeur: '14/04/2008',
  //     },
  //     "ancienneté en fin d'année": {
  //       durée: {
  //         depuis: "date d'embauche",
  //         "jusqu'à": '31/12/2020',
  //       },
  //     },
  //   }
  //   const serializedRules = serializeParsedRules(
  //     new Engine(rules).getParsedRules(),
  //   )
  //   console.log(JSON.stringify(serializedRules, null, 2))
  //   expect(serializedRules).toStrictEqual(rules)
  // })
})
