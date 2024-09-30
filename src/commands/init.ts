import { Args, Command, Flags, ux } from '@oclif/core'
import { exec } from 'node:child_process'
import * as p from '@clack/prompts'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import { basePackageJson, getPackageJson, PackageJson } from '../utils/pjson'

export default class Init extends Command {
  static override args = {}

  static override description = 'initialize a new project'

  static override examples = ['<%= command.id %>']

  static override flags = {}

  public async run(): Promise<void> {
    p.intro(chalk.bgHex('#2975d1')(' publicodes init '))

    const pjson = getPackageJson()

    if (pjson) {
      p.log.info(`Updating existing ${chalk.bold('package.json')} file`)
      updatePackageJson(pjson)
    } else {
      p.log.step(`Creating a new ${chalk.bold('package.json')} file`)
      const pjson = await askPackageJsonInfo()
      updatePackageJson(pjson)
    }

    p.outro('🚀 publicodes is ready to use!')
  }
}

function updatePackageJson(pjson: PackageJson): void {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const fullPjson = { ...basePackageJson, ...pjson }
  try {
    fs.writeFileSync(packageJsonPath, JSON.stringify(fullPjson, null, 2))
    p.log.success(`${chalk.bold('package.json')} file written`)
  } catch (error) {
    p.cancel(
      `An error occurred while writing the ${chalk.magenta('package.json')} file`,
    )
    process.exit(1)
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
          defaultValue: '1.0.0',
          placeholder: '1.0.0',
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
