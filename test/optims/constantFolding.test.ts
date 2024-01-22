import Engine from 'publicodes'
import { serializeParsedRules } from '../../source'
import { RuleName, RawRules, disabledLogger } from '../../source/commons'
import { constantFolding } from '../../source/optims/'
import { callWithEngine } from '../utils.test'

function constantFoldingWith(rawRules: any, targets?: RuleName[]): RawRules {
  const res = callWithEngine(
    (engine) =>
      constantFolding(
        engine,
        targets ? ([ruleName, _]) => targets.includes(ruleName) : undefined,
      ),
    rawRules,
  )
  return serializeParsedRules(res)
}

describe('Constant folding [meta]', () => {
  it('should not modify the original rules', () => {
    const rawRules = {
      ruleA: {
        titre: 'Rule A',
        valeur: 'B . C * D',
      },
      'ruleA . B . C': {
        valeur: '10',
      },
      'ruleA . D': {
        valeur: '3',
      },
    }
    const engine = new Engine(rawRules, {
      logger: disabledLogger,
      allowOrphanRules: true,
    })
    const baseParsedRules = engine.getParsedRules()
    const serializedBaseParsedRules = serializeParsedRules(baseParsedRules)

    constantFolding(engine, ([ruleName, _]) => ruleName === 'ruleA')

    const shouldNotBeModifiedRules = engine.getParsedRules()
    const serializedShouldNotBeModifiedRules = serializeParsedRules(
      shouldNotBeModifiedRules,
    )

    expect(baseParsedRules).toStrictEqual(shouldNotBeModifiedRules)
    expect(serializedBaseParsedRules).toStrictEqual(
      serializedShouldNotBeModifiedRules,
    )
  })
})

describe('Constant folding [base]', () => {
  it('∅ -> ∅', () => {
    expect(constantFoldingWith({})).toStrictEqual({})
  })

  it('should remove empty nodes', () => {
    expect(
      constantFoldingWith({
        ruleB: {
          valeur: '10 * 10',
        },
      }),
    ).toStrictEqual({
      ruleB: {
        valeur: 100,
        optimized: 'fully',
      },
    })
  })

  it('one deps', () => {
    const rawRules = {
      ruleA: {
        titre: 'Rule A',
        valeur: 'B . C * 3',
      },
      'ruleA . B . C': {
        valeur: '10',
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        titre: 'Rule A',
        valeur: 30,
        optimized: 'fully',
      },
    })
  })

  it('should replace a [valeur] with 2 dependencies with the corresponding constant value', () => {
    const rawRules = {
      ruleA: {
        titre: 'Rule A',
        valeur: 'B . C * D',
      },
      'ruleA . B . C': {
        valeur: '10',
      },
      'ruleA . D': {
        valeur: '3',
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        titre: 'Rule A',
        valeur: 30,
        optimized: 'fully',
      },
    })
  })

  it('should replace the constant reference without being able to fold entirely the rule', () => {
    const rawRules = {
      ruleA: {
        titre: 'Rule A',
        valeur: 'B . C * D',
      },
      'ruleA . D': {
        question: "What's the value of D",
      },
      'ruleA . B . C': {
        valeur: '10',
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        titre: 'Rule A',
        valeur: '10 * D',
        optimized: 'partially',
      },
      'ruleA . D': {
        question: "What's the value of D",
      },
    })
  })

  it('should partially fold rule with constant with multiple parents dependencies', () => {
    const rawRules = {
      ruleA: {
        titre: 'Rule A',
        valeur: 'B . C * D',
      },
      ruleB: {
        valeur: 'ruleA . B . C * 3',
      },
      'ruleA . D': {
        question: "What's the value of D?",
      },
      'ruleA . B . C': {
        valeur: '10',
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        titre: 'Rule A',
        valeur: '10 * D',
        optimized: 'partially',
      },
      'ruleA . D': {
        question: "What's the value of D?",
      },
    })
  })

  it('should partially fold rule with constant with multiple parents dependencies add keep the only targeted rule: [ruleA]', () => {
    const rawRules = {
      ruleA: {
        titre: 'Rule A',
        valeur: 'B . C * D',
      },
      ruleB: {
        valeur: 'ruleA . B . C * 3',
      },
      'ruleA . D': {
        question: "What's the value of D?",
      },
      'ruleA . B . C': {
        valeur: '10',
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        titre: 'Rule A',
        valeur: '10 * D',
        optimized: 'partially',
      },
      'ruleA . D': {
        question: "What's the value of D?",
      },
    })
  })

  it('should fold a constant within _two degrees_', () => {
    const rawRules = {
      A: {
        valeur: 'B',
      },
      'A . B': {
        valeur: 'C * 10',
      },
      'A . B . C': {
        valeur: 7,
      },
    }
    expect(constantFoldingWith(rawRules, ['A'])).toStrictEqual({
      A: {
        valeur: 70,
        optimized: 'fully',
      },
    })
  })

  it('should fold constant within two degrees with B, a partially foldable rule', () => {
    const rawRules = {
      A: {
        valeur: 'B',
      },
      B: {
        valeur: 'A . B * D',
      },
      'B . D': {
        question: "What's the value of B . D?",
      },
      'A . B': {
        valeur: 'C * 10',
      },
      'A . B . C': {
        valeur: 7,
      },
    }
    expect(constantFoldingWith(rawRules, ['B'])).toStrictEqual({
      B: {
        valeur: '70 * D',
        optimized: 'partially',
      },
      'B . D': {
        question: "What's the value of B . D?",
      },
    })
  })

  it('should completely fold a [somme] mechanism', () => {
    const rawRules = {
      ruleA: {
        valeur: 'ruleB',
      },
      ruleB: {
        somme: ['A . B * 2', 10, 12 * 2],
      },
      'A . B': {
        valeur: 'C * 10',
      },
      'A . B . C': {
        valeur: 7,
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        valeur: 174,
        optimized: 'fully',
      },
    })
  })

  it('should partially fold [valeur > somme] mechanism', () => {
    const rawRules = {
      ruleA: {
        valeur: 'ruleB',
      },
      ruleB: {
        valeur: {
          somme: ['A . B * D', 10, 12 * 2],
        },
      },
      'ruleB . D': {
        question: "What's the value of ruleB . D?",
      },
      'A . B': {
        valeur: 'C * 10',
      },
      'A . B . C': {
        valeur: 7,
      },
    }
    expect(constantFoldingWith(rawRules, ['ruleA'])).toStrictEqual({
      ruleA: {
        valeur: 'ruleB',
      },
      ruleB: {
        somme: ['70 * D', 10, 24],
        optimized: 'partially',
      },
      'ruleB . D': {
        question: "What's the value of ruleB . D?",
      },
    })
  })

  it('should fold a mutiple [somme] deep dependencies', () => {
    const rawRules = {
      omr: {
        valeur: {
          somme: ['omr . putrescibles', 'omr . papier carton'],
        },
      },
      'omr . putrescibles': {
        valeur: {
          somme: ['stockage', 'incinération'],
        },
      },
      'omr . putrescibles . stockage': {
        valeur: 'stockage . pourcentage * stockage . impact',
        unité: 'kgCO2e',
      },
      'omr . putrescibles . stockage . pourcentage': {
        valeur: '24%',
      },
      'omr . putrescibles . stockage . impact': {
        valeur: 0.692,
        unité: 'kgCO2e/kg',
      },
      'omr . putrescibles . incinération': {
        valeur: 'incinération . pourcentage * incinération . impact',
        unité: 'kgCO2e',
      },
      'omr . putrescibles . incinération . pourcentage': {
        valeur: '68%',
      },
      'omr . putrescibles . incinération . impact': {
        valeur: 0.045,
        unité: 'kgCO2e/kg',
      },
      'omr . papier carton': {
        valeur: {
          somme: ['stockage', 'incinération'],
        },
      },
      'omr . papier carton . stockage': {
        valeur: 'stockage . pourcentage * stockage . impact',
      },
      'omr . papier carton . stockage . pourcentage': {
        valeur: '26%',
      },
      'omr . papier carton . stockage . impact': {
        valeur: 0.95,
      },
      'omr . papier carton . incinération': {
        valeur: 'incinération . pourcentage * incinération . impact',
      },
      'omr . papier carton . incinération . pourcentage': {
        valeur: '26%',
      },
      'omr . papier carton . incinération . impact': {
        valeur: 0.95,
      },
    }
    expect(constantFoldingWith(rawRules, ['omr'])).toStrictEqual({
      omr: {
        valeur: '0.69068 kgCO2e',
        optimized: 'fully',
      },
    })
  })

  it('should replace properly child rule references when one is a substring of the other: (Ambiguity with rule name)', () => {
    const rawRules = {
      biogaz: {
        valeur:
          "biogaz . facteur d'émission * gaz . facteur d'émission + not foldable",
      },
      "biogaz . facteur d'émission": {
        valeur: 20,
      },
      "gaz . facteur d'émission": {
        valeur: 10,
      },
      'not foldable': {
        question: 'The user needs to provide a value.',
      },
    }
    expect(constantFoldingWith(rawRules, ['biogaz'])).toStrictEqual({
      biogaz: {
        valeur: '(20 * 10) + not foldable',
        optimized: 'partially',
      },
      'not foldable': {
        question: 'The user needs to provide a value.',
      },
    })
  })

  it('replaceAllRefs bug #1', () => {
    const rawRules = {
      biogaz: {
        valeur:
          "gaz . facteur d'émission * biogaz . facteur d'émission + not foldable",
      },
      "biogaz . facteur d'émission": {
        valeur: 20,
      },
      "gaz . facteur d'émission": {
        valeur: 10,
      },
      'not foldable': {
        question: 'The user needs to provide a value.',
      },
    }
    expect(constantFoldingWith(rawRules, ['biogaz'])).toStrictEqual({
      biogaz: {
        valeur: '(10 * 20) + not foldable',
        optimized: 'partially',
      },
      'not foldable': {
        question: 'The user needs to provide a value.',
      },
    })
  })

  it('replaceAllRefs bug #2', () => {
    const rawRules = {
      boisson: {
        valeur: 'tasse de café * nombre',
      },
      'boisson . tasse de café': {
        valeur: 20,
      },
      'boisson . nombre': {
        'par défaut': 10,
      },
    }
    expect(constantFoldingWith(rawRules, ['boisson'])).toStrictEqual({
      boisson: {
        valeur: '20 * nombre',
        optimized: 'partially',
      },
      'boisson . nombre': {
        'par défaut': 10,
      },
    })
  })

  it('should fold standalone [valeur] rule', () => {
    const rawRules = {
      boisson: 'tasse de café * nombre',
      'boisson . tasse de café': {
        valeur: 20,
      },
      'boisson . nombre': {
        'par défaut': 10,
      },
    }
    expect(constantFoldingWith(rawRules, ['boisson'])).toStrictEqual({
      boisson: {
        valeur: '20 * nombre',
        optimized: 'partially',
      },
      'boisson . nombre': {
        'par défaut': 10,
      },
    })
  })

  it('should keeps % when folding', () => {
    const rawRules = {
      boisson: 'pct * nombre',
      'boisson . pct': {
        valeur: '2%',
      },
      'boisson . nombre': {
        'par défaut': 10,
      },
    }
    expect(constantFoldingWith(rawRules, ['boisson'])).toStrictEqual({
      boisson: {
        valeur: '2 % * nombre',
        optimized: 'partially',
      },
      'boisson . nombre': {
        'par défaut': 10,
      },
    })
  })

  it('par défaut = 0', () => {
    const rawRules = {
      'chocolat chaud': {
        valeur: 'tasse de chocolat chaud * nombre',
      },
      'tasse de chocolat chaud': {
        valeur: 20.3,
      },
      'chocolat chaud . nombre': {
        question: 'Nombre de chocolats chauds par semaine',
        'par défaut': 0,
      },
    }
    expect(constantFoldingWith(rawRules, ['chocolat chaud'])).toStrictEqual({
      'chocolat chaud': {
        valeur: '20.3 * nombre',
        optimized: 'partially',
      },
      'chocolat chaud . nombre': {
        question: 'Nombre de chocolats chauds par semaine',
        'par défaut': 0,
      },
    })
  })

  it('should replace constant ref, even if it starts with diacritic', () => {
    const rawRules = {
      piscine: {
        icônes: '🏠🏊',
      },
      'piscine . empreinte': {
        valeur: { somme: ['équipés * nombre * équipés * équipés'] },
      },
      'piscine . nombre': { question: 'Combien ?', 'par défaut': 2 },
      'piscine . équipés': { valeur: 45 },
    }
    expect(
      constantFoldingWith(rawRules, ['piscine . empreinte']),
    ).toStrictEqual({
      'piscine . empreinte': {
        somme: ['((45 * nombre) * 45) * 45'],
        optimized: 'partially',
      },
      'piscine . nombre': { question: 'Combien ?', 'par défaut': 2 },
    })
  })

  it('should work with parentheses inside [valeur]', () => {
    const rawRules = {
      'divers . ameublement . meubles . armoire . empreinte amortie': {
        titre: 'Empreinte armoire amortie',
        valeur: 'armoire . empreinte / (durée * coefficient préservation)',
        unité: 'kgCO2e',
      },
      'divers . ameublement . meubles . armoire . coefficient préservation': 45,
      'divers . ameublement . meubles . armoire . durée': 10,
      'divers . ameublement . meubles . armoire . empreinte': {
        question: 'Empreinte?',
      },
    }
    expect(
      constantFoldingWith(rawRules, [
        'divers . ameublement . meubles . armoire . empreinte amortie',
      ]),
    ).toStrictEqual({
      'divers . ameublement . meubles . armoire . empreinte amortie': {
        titre: 'Empreinte armoire amortie',
        valeur: 'armoire . empreinte / (10 * 45)',
        unité: 'kgCO2e',
        optimized: 'partially',
      },
      'divers . ameublement . meubles . armoire . empreinte': {
        question: 'Empreinte?',
      },
    })
  })

  it('should not fold rules impacted by a [contexte] with a question in dependency', () => {
    const rawRules = {
      root: {
        valeur: 'rule to recompute',
        contexte: {
          constant: 20,
        },
      },
      'rule to recompute': {
        valeur: 'constant * 2 * question',
      },
      question: {
        question: 'Question ?',
      },
      constant: {
        valeur: 10,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        valeur: 'rule to recompute',
        contexte: {
          constant: 20,
        },
      },
      'rule to recompute': {
        valeur: '(constant * 2) * question',
      },
      question: {
        question: 'Question ?',
      },
      constant: {
        valeur: 10,
      },
    })
  })

  it('should fold rules impacted by a [contexte] with multiple contexte rules', () => {
    const rawRules = {
      root: {
        valeur: 'rule to recompute',
        contexte: {
          constant: 50,
          'constant 2': 100,
        },
      },
      'rule to recompute': {
        valeur: 'constant * 2 + constant 2',
      },
      constant: {
        valeur: 10,
      },
      'constant 2': {
        valeur: 15,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        valeur: 200,
        optimized: 'fully',
      },
    })
  })

  it('should not fold nested rules (2 deep) impacted by a [contexte]', () => {
    const rawRules = {
      root: {
        valeur: 'rule to recompute',
        contexte: {
          constant: 20,
        },
      },
      'rule to recompute': {
        valeur: 'nested 1 * 2',
      },
      'rule to recompute . nested 1': {
        valeur: 'nested 2 * 4',
      },
      'rule to recompute . nested 2': {
        valeur: 'nested 3 * 4',
      },
      'rule to recompute . nested 3': {
        valeur: 'constant * 4 * question',
      },
      question: {
        question: 'Question ?',
      },
      constant: {
        valeur: 10,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        valeur: 'rule to recompute',
        contexte: {
          constant: 20,
        },
      },
      'rule to recompute': {
        valeur: 'nested 1 * 2',
      },
      'rule to recompute . nested 1': {
        valeur: 'nested 2 * 4',
      },
      'rule to recompute . nested 2': {
        valeur: 'nested 3 * 4',
      },
      'rule to recompute . nested 3': {
        valeur: '(constant * 4) * question',
      },
      question: {
        question: 'Question ?',
      },
      constant: {
        valeur: 10,
      },
    })
  })

  it('should not fold rules impacted by a [contexte] with nested mechanisms in the formula', () => {
    const rawRules = {
      root: {
        valeur: {
          somme: ['rule to recompute', 'question', 10],
        },
        contexte: {
          constant: 20,
        },
      },
      'rule to recompute': {
        valeur: 'constant * 2',
      },
      question: {
        question: 'Question ?',
      },
      constant: {
        valeur: 10,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        somme: ['rule to recompute', 'question', 10],
        contexte: {
          constant: 20,
        },
      },
      'rule to recompute': {
        valeur: 'constant * 2',
      },
      question: {
        question: 'Question ?',
      },
      constant: {
        valeur: 10,
      },
    })
  })

  // TODO: fine tune the contexte fold
  // it('should fold rules impacted by a [contexte] with nested mechanisms in the formula', () => {
  //   const rawRules = {
  //     root: {
  //       valeur: {
  //         somme: ['rule to recompute', 'question', 10],
  //       },
  //       contexte: {
  //         constant: 20,
  //       },
  //     },
  //     'rule to recompute': {
  //       valeur: 'constant * 2 * foldable',
  //     },
  //     question: {
  //       question: 'Question ?',
  //     },
  //     constant: {
  //       valeur: 10,
  //     },
  //     foldable: {
  //       valeur: 15,
  //     },
  //   }
  //   expect(constantFoldingWith(rawRules)).toStrictEqual({
  //     root: {
  //       somme: ['rule to recompute', 'question', 10],
  //       contexte: {
  //         constant: 20,
  //       },
  //     },
  //     'rule to recompute': {
  //       valeur: '(constant * 2) * 15',
  //     },
  //     question: {
  //       question: 'Question ?',
  //     },
  //     constant: {
  //       valeur: 10,
  //     },
  //   })
  // })

  it('should fold a constant rule even with [contexte]', () => {
    const rawRules = {
      root: {
        valeur: 'rule to recompute',
        contexte: {
          constant: 15,
        },
      },
      'rule to recompute': {
        valeur: 'constant * 2',
      },
      'rule to fold': {
        valeur: 'constant * 4',
      },
      constant: {
        valeur: 10,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        valeur: 30,
        optimized: 'fully',
      },
      'rule to fold': {
        valeur: 40,
        optimized: 'fully',
      },
    })
  })

  it('replaceAllRefs bug #3', () => {
    const rawRules = {
      boisson: {
        valeur: 'tasse de café * café',
      },
      'boisson . café': {
        valeur: 20,
      },
      'boisson . tasse de café': {
        question: '?',
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      boisson: {
        valeur: 'tasse de café * 20',
        optimized: 'partially',
      },
      'boisson . tasse de café': {
        question: '?',
      },
    })
  })

  it('should fold a unit rule with a constant [unité]', () => {
    const rawRules = {
      root: {
        formule: '14 repas/semaine * plats . végétalien . empreinte',
        unité: 'kgCO2e/semaine',
      },
      'plats . végétalien . empreinte': {
        titre: "Empreinte d'un repas végétalien",
        formule: 0.785,
        unité: 'kgCO2e/repas',
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        valeur: '10.99 kgCO2e/semaine',
        unité: 'kgCO2e/semaine',
        optimized: 'fully',
      },
    })
  })

  it('should fold a constant within two degrees with an [applicable si] (set to false) mechanism', () => {
    const rawRules = {
      A: {
        valeur: 'B',
      },
      'A . B': {
        'applicable si': 'présent',
        valeur: 'C * 10',
      },
      'A . B . présent': {
        question: 'Is present?',
        'par défaut': 'non',
      },
      'A . B . C': {
        valeur: 7,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      A: {
        valeur: 'B',
      },
      'A . B': {
        'applicable si': 'présent',
        valeur: '7 * 10',
        optimized: 'partially',
      },
      'A . B . présent': {
        question: 'Is present?',
        'par défaut': 'non',
      },
    })
  })

  it('should fold a constant within two degrees with an [applicable si] (set to true) mechanism', () => {
    const rawRules = {
      A: {
        valeur: 'B',
      },
      'A . B': {
        'applicable si': 'présent',
        valeur: 'C * 10',
      },
      'A . B . présent': {
        question: 'Is present?',
        'par défaut': 'oui',
      },
      'A . B . C': {
        valeur: 7,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      A: {
        valeur: 'B',
      },
      'A . B': {
        'applicable si': 'présent',
        valeur: '7 * 10',
        optimized: 'partially',
      },
      'A . B . présent': {
        question: 'Is present?',
        'par défaut': 'oui',
      },
    })
  })

  it('should not delete leaf used in [applicable si > toutes ces conditions (evaluated to ⊤)]', () => {
    const rawRules = {
      root: {
        'applicable si': {
          'toutes ces conditions': ['unfoldable < foldable'],
        },
        valeur: 'foldable * unfoldable',
      },
      'root . foldable': {
        valeur: 20,
      },
      'root . unfoldable': {
        'par défaut': 10,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        'applicable si': {
          'toutes ces conditions': ['unfoldable < 20'],
        },
        valeur: '20 * unfoldable',
        optimized: 'partially',
      },
      'root . unfoldable': {
        'par défaut': 10,
      },
    })
  })

  it('should not delete leaf used in [applicable si > toutes ces conditions (evaluated to ⊥)] ', () => {
    const rawRules = {
      root: {
        'applicable si': {
          'toutes ces conditions': ['unfoldable > foldable'],
        },
        valeur: 'foldable * unfoldable',
      },
      'root . foldable': {
        valeur: 20,
      },
      'root . unfoldable': {
        'par défaut': 10,
      },
    }
    expect(constantFoldingWith(rawRules)).toStrictEqual({
      root: {
        'applicable si': {
          'toutes ces conditions': ['unfoldable > 20'],
        },
        valeur: '20 * unfoldable',
        optimized: 'partially',
      },
      'root . unfoldable': {
        'par défaut': 10,
      },
    })
  })
})
