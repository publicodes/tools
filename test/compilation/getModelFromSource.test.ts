import { getModelFromSource } from '../../source/compilation/getModelFromSource'
import { join, resolve } from 'path'

const testDataDir = resolve('./test/compilation/data/')

const updatedDescription = `> Cette règle provient du modèle **my-external-package**.`

describe('getModelFromSource › rules import', () => {
  it('should import a rule from a package', () => {
    expect(
      getModelFromSource(join(testDataDir, 'simple-import.publicodes')),
    ).toEqual({
      'root . a': {
        formule: 10,
        description: updatedDescription,
      },
    })
  })

  it('should import a rule from a package with its needed dependency', () => {
    expect(
      getModelFromSource(join(testDataDir, 'deps-import.publicodes')),
    ).toEqual({
      'root . b': {
        formule: 'root . c * 2',
        description: updatedDescription,
      },
      'root . c': {
        formule: 20,
        description: updatedDescription,
      },
    })
  })

  it('should import a rule from a package with all its needed dependencies', () => {
    expect(
      getModelFromSource(join(testDataDir, 'multiple-deps-import.publicodes')),
    ).toEqual({
      root: {
        formule: 'a * b',
        description: updatedDescription,
      },
      'root . a': {
        formule: 10,
        description: updatedDescription,
      },
      'root . b': {
        formule: 'root . c * 2',
        description: updatedDescription,
      },
      'root . c': {
        formule: 20,
        description: updatedDescription,
      },
    })
  })

  it('should import a rule from a package with all updated attributs', () => {
    expect(
      getModelFromSource(join(testDataDir, 'updated-attrs-import.publicodes')),
    ).toEqual({
      'root . a': {
        formule: 10,
        titre: "Ajout d'un titre",
        description: updatedDescription,
      },
      'root . c': {
        formule: 20,
        description: `
${updatedDescription}


Ajout d'une description`,
      },
      'root 2': {
        formule: 20,
        résumé: "Modification d'un résumé",
        description: updatedDescription,
      },
    })
  })

  it('should not import an unknown rule', () => {
    expect(() => {
      getModelFromSource(join(testDataDir, 'unknown-import.publicodes'))
    }).toThrow(
      "La règle 'root . unknown' n'existe pas dans my-external-package",
    )
  })

  it('should not import doublon rules', () => {
    expect(() => {
      getModelFromSource(join(testDataDir, 'doublon-import.publicodes'))
    }).toThrow(
      "La règle 'root . a' est définie deux fois dans my-external-package",
    )
  })
})
