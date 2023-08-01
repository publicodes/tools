import { getModelFromSource } from '../source/compilation/getModelFromSource'
import { join, resolve } from 'path'

const testDataDir = resolve('./test/data/')

describe('getModelFromSource › rules import', () => {
  it('should import a rule from a package', () => {
    expect(
      getModelFromSource(join(testDataDir, 'simple-import.publicodes'), {
        verbose: true,
      })
    ).toEqual({
      'root . a': {
        formule: 10,
      },
    })
  })

  it('should import a rule from a package with all its needed dependencies', () => {
    expect(
      getModelFromSource(join(testDataDir, 'simple-import.publicodes'), {
        verbose: true,
      })
    ).toEqual({
      'root . a': {
        formule: 10,
      },
    })
  })
})
