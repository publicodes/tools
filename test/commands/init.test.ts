import { execSync } from 'child_process'
import { CLIExecutor, runInDir } from '../cli-utils'
import fs from 'fs'
import { PackageJson } from '../../src/utils/pjson'
import path from 'path'
import {} from '@oclif/test'

describe('publicodes init', () => {
  it('should update existing package.json', async () => {
    const cli = new CLIExecutor()

    runInDir('tmp', async (cwd) => {
      execSync('yarn init -y')

      const { stdout } = await cli.execCommand('init -p yarn')

      expect(stdout).toContain('Updating existing package.json file')
      expect(stdout).toContain('package.json file written')
      expect(stdout).toContain('Files generated')
      expect(stdout).toContain('New to Publicodes?')

      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
      expect(packageJson).toMatchObject<PackageJson>({
        name: path.basename(cwd),
        type: 'module',
        main: 'build/index.js',
        types: 'build/index.d.ts',
        files: ['build'],
        peerDependencies: {
          publicodes: '^1.5.1',
        },
        devDependencies: {
          '@publicodes/tools': packageJson.devDependencies['@publicodes/tools'],
        },
        version: '1.0.0',
        description: '',
        author: '',
        license: 'MIT',
      })

      expect(fs.existsSync('node_modules')).toBe(true)
      expect(fs.existsSync('yarn.lock')).toBe(true)
      expect(fs.existsSync('README.md')).toBe(true)
      expect(fs.existsSync('src/base.publicodes')).toBe(true)
    })
  })
})
