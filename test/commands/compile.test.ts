import { CLIExecutor, runInDir } from '../cli-utils'
import fs from 'fs'
import path from 'path'

const cli = new CLIExecutor()

describe('publicodes compile', () => {
  it('should compile with no arguments/flags', async () => {
    runInDir('tmp', async (cwd) => {
      const { stdout } = await cli.execCommand('compile')
      expect(stdout).toContain('Compilation complete!')
      expect(fs.existsSync('build')).toBe(true)
      expect(fs.existsSync('build/index.js')).toBe(true)
      expect(fs.existsSync(`build/${path.basename(cwd)}.model.json`)).toBe(true)
      expect(fs.existsSync(`build/index.d.ts`)).toBe(true)
    })
  })
})
