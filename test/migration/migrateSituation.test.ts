import { migrateSituation } from '../../source/migration/migrateSituation'

const migrationInstructions = {
  keysToMigrate: { age: 'âge', 'année de naissance': '' },
  valuesToMigrate: { prénom: { jean: 'Jean avec un J', michel: '' } },
}

describe('migrateSituation', () => {
  it('should migrate key', () => {
    expect(
      migrateSituation({
        situation: { age: 27 },
        foldedSteps: ['age'],
        migrationInstructions,
      }),
    ).toEqual({ situationMigrated: { âge: 27 }, foldedStepsMigrated: ['âge'] })
  }),
    it('should migrate value', () => {
      expect(
        migrateSituation({
          situation: { prénom: 'jean' },
          foldedSteps: ['prénom'],
          migrationInstructions,
        }),
      ).toEqual({
        situationMigrated: { prénom: "'Jean avec un J'" },
        foldedStepsMigrated: ['prénom'],
      })
    }),
    it('should delete key', () => {
      expect(
        migrateSituation({
          situation: { 'année de naissance': 1997 },
          foldedSteps: ['année de naissance'],
          migrationInstructions,
        }),
      ).toEqual({
        foldedStepsMigrated: [],
        situationMigrated: {},
      })
    }),
    it('should delete value', () => {
      expect(
        migrateSituation({
          situation: { prénom: 'michel' },
          foldedSteps: ['prénom'],
          migrationInstructions,
        }),
      ).toEqual({
        foldedStepsMigrated: [],
        situationMigrated: {},
      })
    }),
    it('should support old situations', () => {
      expect(
        migrateSituation({
          situation: { âge: { valeur: 27, unité: 'an' } },
          foldedSteps: ['âge'],
          migrationInstructions,
        }),
      ).toEqual({
        foldedStepsMigrated: ['âge'],
        situationMigrated: { âge: 27 },
      })
    })
})
