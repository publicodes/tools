import fs from 'fs'
import path from 'path'
import { execSync } from 'node:child_process'
import { Command, Flags } from '@oclif/core'
import * as p from '@clack/prompts'
import chalk from 'chalk'

import { basePackageJson, getPackageJson, PackageJson } from '../utils/pjson'
import { OptionFlag } from '@oclif/core/lib/interfaces'
import { spawn } from 'child_process'

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

export default class Init extends Command {
  static override args = {}

  static override summary = 'Initialize a new project'

  static override description = `
If no package.json file is found in the current directory, this command will
create one and install the necessary dependencies with the specified package
manager. Otherwise, it will update the existing package.json file.
`

  static override examples = [
    { command: '<%= command.id %>', description: 'initialize a new project' },
    {
      command: '<%= command.id %> -p yarn',
      description: 'initialize a new project with Yarn',
    },
  ]

  static override flags = {
    'pkg-manager': Flags.string({
      char: 'p',
      summary: 'The package manager to use',
      description: `
The package manager that will be used to install dependencies. If not provided,
the command will try to detect the package manager based on the lock files
present in the project directory, otherwise it will prompt the user to choose
one.
`,
      options: ['npm', 'yarn', 'pnpm', 'bun'],
    }) as OptionFlag<PackageManager | undefined>,
  }

  public async run(): Promise<void> {
    p.intro(chalk.bgHex('#2975d1')(' publicodes init '))

    const { flags } = await this.parse(Init)
    const pkgJSON = getPackageJson()

    if (pkgJSON) {
      p.log.info(`Updating existing ${chalk.bold('package.json')} file`)
      this.updatePackageJson(pkgJSON)
    } else {
      p.log.step(`Creating a new ${chalk.bold('package.json')} file`)
      const pjson = await askPackageJsonInfo()
      this.updatePackageJson(pjson)
    }

    const pkgManager: PackageManager =
      flags['pkg-manager'] ??
      findPackageManager() ??
      (await askPackageManager())
    await installDeps(pkgManager)

    generateBaseFiles()

    p.outro('🚀 publicodes is ready to use!')
  }

  private updatePackageJson(pkgJSON: PackageJson): void {
    const packageJsonPath = path.join(process.cwd(), 'package.json')

    pkgJSON.type = basePackageJson.type
    pkgJSON.main = basePackageJson.main
    pkgJSON.types = basePackageJson.types
    pkgJSON.license = pkgJSON.license ?? basePackageJson.license
    pkgJSON.version = pkgJSON.version ?? basePackageJson.version
    pkgJSON.description = pkgJSON.description ?? basePackageJson.description
    pkgJSON.author = pkgJSON.author ?? basePackageJson.author
    pkgJSON.files = basePackageJson.files!.concat(pkgJSON.files ?? [])
    pkgJSON.peerDependencies = {
      ...pkgJSON.peerDependencies,
      ...basePackageJson.peerDependencies,
    }
    pkgJSON.devDependencies = {
      ...pkgJSON.devDependencies,
      '@publicodes/tools': `^${this.config.pjson.version}`,
    }
    pkgJSON.scripts = {
      ...pkgJSON.scripts,
      ...basePackageJson.scripts,
    }
    if (pkgJSON.name.startsWith('@')) {
      pkgJSON.publishConfig = { access: 'public' }
    }

    try {
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJSON, null, 2))
      p.log.success(`${chalk.bold('package.json')} file written`)
    } catch (error) {
      p.cancel(
        `An error occurred while writing the ${chalk.magenta('package.json')} file`,
      )
      process.exit(1)
    }
  }
}

function askPackageJsonInfo(): Promise<PackageJson> {
  const currentDir = path.basename(process.cwd())

  return p.group(
    {
      name: () =>
        p.text({
          message: 'Name',
          defaultValue: currentDir,
          placeholder: currentDir,
        }),
      description: () => p.text({ message: 'Description', defaultValue: '' }),
      version: () =>
        p.text({
          message: 'Version',
          defaultValue: '0.1.0',
          placeholder: '0.1.0',
        }),
      author: () => p.text({ message: 'Author', defaultValue: '' }),
      license: () =>
        p.text({
          message: 'License',
          defaultValue: 'MIT',
          placeholder: 'MIT',
        }),
    },
    {
      onCancel: () => {
        p.cancel('init cancelled')
        process.exit(1)
      },
    },
  )
}

function findPackageManager(): PackageManager | undefined {
  if (fs.existsSync('yarn.lock')) {
    return 'yarn'
  }
  if (fs.existsSync('pnpm-lock.yaml')) {
    return 'pnpm'
  }
  if (fs.existsSync('bun.lock')) {
    return 'bun'
  }
  if (fs.existsSync('package-lock.json')) {
    return 'npm'
  }
}

function askPackageManager(): Promise<PackageManager> {
  const checkIfInstalled = (cmd: string): boolean => {
    try {
      execSync(`${cmd} -v`, { stdio: 'ignore' })
      return true
    } catch (error) {
      return false
    }
  }
  return p.select<any, PackageManager>({
    message: 'Choose a package manager',
    options: ['npm', 'yarn', 'pnpm', 'bun']
      .filter((pm) => checkIfInstalled(pm))
      .map((pm) => ({ value: pm, label: pm })),
  }) as Promise<PackageManager>
}

async function installDeps(pkgManager: PackageManager): Promise<void> {
  const s = p.spinner()

  s.start(`Installing dependencies with ${pkgManager}`)
  return new Promise((resolve) => {
    const program = spawn(pkgManager, ['install', '-y'], { stdio: 'ignore' })

    program.on('error', (error) => {
      s.stop('An error occurred while installing dependencies')
      p.log.error(error.message)
      process.exit(1)
    })

    program.on('close', () => {
      s.stop('Dependencies installed')
      resolve()
    })
  })
}

function generateBaseFiles() {
  p.log.step('Generating files')
}
