import fs from 'fs'
import path from 'path'
import { execSync } from 'node:child_process'
import { Command, Flags } from '@oclif/core'
import * as p from '@clack/prompts'
import chalk from 'chalk'

import {
  exitWithError,
  runAsyncWithSpinner,
  runWithSpinner,
  Spinner,
} from '../utils/cli'
import { basePackageJson, PackageJson, readPackageJson } from '../utils/pjson'
import { OptionFlag } from '@oclif/core/lib/interfaces'
import { spawn } from 'child_process'

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'
type ExtraTool = 'gh-actions' | 'test'

export default class Init extends Command {
  static override args = {}

  static override summary = 'Initialize a new project.'

  static override description = `
If no package.json file is found in the current directory, this command will
create one and install the necessary dependencies with the specified package
manager. Otherwise, it will update the existing package.json file.
`

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Initialize a new project.',
    },
    {
      command: '<%= config.bin %> <%= command.id %> -p yarn',
      description: 'Initialize a new project with Yarn.',
    },
  ]

  static override flags = {
    'pkg-manager': Flags.string({
      char: 'p',
      summary: 'The package manager to use.',
      description: `The package manager that will be used to install dependencies. If not provided,
the command will try to detect the package manager based on the lock files
present in the project directory, otherwise it will prompt the user to choose
one.
`,
      options: ['npm', 'yarn', 'pnpm', 'bun'],
    }) as OptionFlag<PackageManager | undefined>,
    'no-install': Flags.boolean({
      char: 'n',
      summary: 'Skip the installation of dependencies.',
      description: `By default, the commmand will try to install the dependencies using the
specified package manager (or the detected one). Use this flag to skip the
installation.`,
    }),
    yes: Flags.boolean({
      char: 'y',
      summary: 'Skip all prompts and use the default values.',
    }),
  }

  // TODO: refactor to have a unique project object which is built and passed
  // to the methods before writing it in one go.
  public async run(): Promise<void> {
    p.intro(chalk.bgHex('#2975d1')(' publicodes init '))

    const { flags } = await this.parse(Init)
    const currentDir = path.basename(process.cwd())
    const pkgJSON = await this.getPackageJson(currentDir, flags.yes)

    // TODO: check for existing 'test' directory and '.github/workflows' directory
    const extraTools = await getExtraTools(flags.yes)
    // TODO: factorize this
    if (p.isCancel(extraTools)) {
      p.cancel('init cancelled')
      process.exit(1)
    }

    if (extraTools.includes('gh-actions')) {
      // TODO
      // setupGithubActions()
    }
    if (extraTools.includes('test')) {
      setupTests(pkgJSON)
    }

    const pkgManager = await getPackageManager(flags['pkg-manager'], flags.yes)
    if (p.isCancel(pkgManager)) {
      p.cancel('init cancelled')
      process.exit(1)
    }

    await generateBaseFiles(pkgJSON, pkgManager)

    const shouldInstall =
      flags['no-install'] === undefined && !flags.yes
        ? await p.confirm({
            message: 'Do you want to install the dependencies?',
          })
        : !flags['no-install']

    if (shouldInstall) {
      await installDeps(pkgManager)
    }

    p.note(
      `${chalk.bold('You can now:')}
- write your Publicodes rules in ${chalk.bold.yellow('.src/')}
- compile them using: ${chalk.bold.yellow(`${pkgManager} run compile`)}`,
      chalk.bold('Publicodes is ready to use 🚀'),
    )

    p.outro(
      `New to Publicodes? Learn more at ${chalk.underline.cyan('https://publi.codes/docs')}`,
    )
  }

  private async getPackageJson(
    currentDir: string,
    useDefault: boolean,
  ): Promise<PackageJson> {
    let pkgJSON = readPackageJson()

    if (!pkgJSON && useDefault) {
      pkgJSON = { ...basePackageJson, name: currentDir }
    }
    if (!pkgJSON) {
      pkgJSON = await askPackageJsonInfo(currentDir)
    }

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
      // NOTE: to test with the packaged version
      '@publicodes/tools': `^${this.config.pjson.version}`,
    }
    pkgJSON.scripts = {
      ...pkgJSON.scripts,
      ...basePackageJson.scripts,
    }
    if (pkgJSON.name.startsWith('@')) {
      pkgJSON.publishConfig = { access: 'public' }
    }

    return pkgJSON
  }
}

async function getPackageManager(
  flagedPkgManager: PackageManager | undefined,
  useDefault: boolean,
): Promise<PackageManager> {
  if (flagedPkgManager) {
    return flagedPkgManager
  }
  const currentPkgManager = findPackageManager()
  if (currentPkgManager) {
    return currentPkgManager
  }

  return useDefault ? 'npm' : await askPackageManager()
}

function askPackageJsonInfo(currentDir: string): Promise<PackageJson> {
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

async function getExtraTools(useDefault: boolean): Promise<ExtraTool[]> {
  if (useDefault) {
    return ['gh-actions', 'test']
  }
  return p.multiselect({
    message: `Select extra tools (press ${chalk.bold.italic('space')} to unselect)`,
    options: [
      {
        value: 'gh-actions',
        label: 'GitHub Actions',
        hint: 'automate build, test and publishing',
      },
      { value: 'test', label: 'Unit test', hint: 'Vitest + example' },
    ],
    required: false,
    initialValues: ['gh-actions', 'test'],
  }) as Promise<ExtraTool[]>
}

function setupTests(pkgJSON: PackageJson) {
  pkgJSON.devDependencies = {
    ...pkgJSON.devDependencies,
    vitest: '^2.1.2',
    '@types/jest': '^29.5.13',
  }
  pkgJSON.scripts = {
    ...pkgJSON.scripts,
    test: 'vitest --globals',
  }
  return pkgJSON
}

async function installDeps(pkgManager: PackageManager): Promise<void> {
  return runAsyncWithSpinner(
    'Installing dependencies',
    'Dependencies installed',
    (spinner: Spinner) => {
      return new Promise<void>((resolve) => {
        const program = spawn(pkgManager, ['install'], {
          stdio: 'ignore',
        })

        program.on('error', (error) => {
          exitWithError({
            ctx: 'An error occurred while installing dependencies',
            msg: error.message,
            spinner,
          })
        })

        program.on('close', (code) => {
          if (code !== 0) {
            exitWithError({
              ctx: `An error occurred while installing dependencies (exec: ${pkgManager} install)`,
              msg: `Process exited with code ${code}`,
              spinner,
            })
          }
          resolve()
        })
      })
    },
  )
}

async function generateBaseFiles(
  pjson: PackageJson,
  pkgManager: PackageManager,
): Promise<void> {
  return runWithSpinner('Generating files', 'Files generated', (spinner) => {
    try {
      // Generate package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json')
      fs.writeFileSync(packageJsonPath, JSON.stringify(pjson, null, 2))

      // Generate README.md
      if (!fs.existsSync('README.md')) {
        fs.writeFileSync('README.md', getReadmeContent(pjson, pkgManager))
      }

      // Generate src directory with a base.publicodes file as an example
      if (!fs.existsSync('src')) {
        fs.mkdirSync('src')
      }
      if (!fs.existsSync('src/salaire.publicodes')) {
        fs.writeFileSync('src/salaire.publicodes', BASE_PUBLICODES)
      }
      if (!fs.existsSync('.gitignore')) {
        try {
          execSync('git init', { stdio: 'ignore' })
        } catch (error) {
          p.log.warn(
            `Could not initialize a git repository (make sure ${chalk.bold.italic('git')} is installed)`,
          )
        }
        fs.writeFileSync(
          '.gitignore',
          `node_modules\n${pjson.files?.join('\n')}`,
        )
      }

      if (!fs.existsSync('test')) {
        fs.mkdirSync('test')
      }

      fs.writeFileSync('test/salaire.test.ts', BASE_TEST_FILE)
    } catch (error) {
      exitWithError({
        ctx: 'An error occurred while generating files',
        msg: error.message,
        spinner,
      })
    }
  })
}

function getReadmeContent(
  pjson: PackageJson,
  pkgManager: PackageManager,
): string {
  return `# ${pjson.name}

${pjson.description}

## Installation

\`\`\`sh
${pkgManager} install ${pjson.name} publicodes
\`\`\`

## Usage

\`\`\`typescript
import { Engine } from 'publicodes'
import rules from '${pjson.name}'

const engine = new Engine(rules)

console.log(engine.evaluate('salaire net').nodeValue)
// 1957.5

engine.setSituation({ 'salaire brut': 4000 })
console.log(engine.evaluate('salaire net').nodeValue)
// 3120
\`\`\`

## Development

\`\`\`sh
// Install the dependencies
${pkgManager} install

// Compile the Publicodes rules
${pkgManager} run compile

${
  pjson.scripts?.test
    ? `// Run the tests
${pkgManager} run test`
    : ''
}

// Run the documentation server
${pkgManager} run doc
\`\`\`
`
}

const BASE_PUBLICODES = `# Règles d'exemples automatiquement générées.
# Supprimez ce fichier ou ajoutez vos propres règles.

salaire net: salaire brut - cotisations salariales

salaire brut:
  titre: Salaire brut mensuel
  par défaut: 2500 
  unité: €/mois

cotisations salariales:
  produit:
    - salaire brut
    - taux
  avec:
    taux: 21.7%
`

const BASE_TEST_FILE = `import Engine, { serializeEvaluation, serializeUnit } from "publicodes";
import rules from "../build";

describe("Salaire net", () => {
  test("salaire brut par défaut", () => {
    const engine = new Engine(rules);
    const result = engine.evaluate("salaire net");

    expect(result.nodeValue).toBe(1957.5);
    expect(serializeEvaluation(result)).toBe("1957.5€/mois");
  });

  test.each([
    [1957.5, 2500],
    [2740.5, 3500],
    [0, 0],
  ])("%f €/mois, avec salaire brut = %f €/mois", (salaireNet, salaireBrut) => {
    const engine = new Engine(rules);
    engine.setSituation({ "salaire brut": salaireBrut });
    const result = engine.evaluate("salaire net");

    expect(result.nodeValue).toBe(salaireNet);
    expect(serializeUnit(result.unit)).toBe("€/mois");
  });
});
`
