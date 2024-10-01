import { execSync } from 'child_process'
import { CLIExecutor, runInDir } from '../cli-utils'
import fs from 'fs'

describe('publicodes init', () => {
  it('should update existing package.json', async () => {
    const cli = new CLIExecutor()

    runInDir('tmp', async () => {
      execSync('yarn init -y')
      const { stdout } = await cli.execCommand('init')

      expect(stdout).toContain('existing package.json file')
      expect(stdout).toContain('package.json file written')
      expect(stdout).toContain('🚀 publicodes is ready to use!')
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
      expect(packageJson).toMatchObject({
        type: 'module',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        peerDependencies: {
          publicodes: '^1.5.1',
        },
        devDependencies: {
          '@publicodes/tools': '^1.5.1',
        },
      })
    })
  })
})
