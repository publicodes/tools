import * as p from '@clack/prompts'
import { Args, Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import createDevServer from '../create-dev-server'

export default class Compile extends Command {
  static override args = {
    files: Args.file({ description: 'Files to compile.' }),
  }

  static override strict = false

  static override summary = 'Launch publicodes documentation dev server'

  static override description = `
This command will start a local server to serve the publicodes auto-generated documentation of the model. 

It will open a browser window with the documentation. The server will automatically reload the page when the documentation is updated.
`

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: `Compile all publicodes files in the src/ directory into the build/ directory.`,
    },
    {
      command: '<%= config.bin %> <%= command.id %> src/**/*.publicodes',
      description: 'Compile all publicodes files in the src/ directory.',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> src/file1.publicodes src/file2.publicodes -o ../dist',
      description:
        'Compile only the specified files into the ../dist/ directory.',
    },
  ]

  static override flags = {
    host: Flags.string({
      char: 'h',
      summary:
        'Specify which IP addresses the server should listen on. Set this to 0.0.0.0 or true to listen on all addresses, including LAN and public addresses.',
    }),

    port: Flags.string({
      char: 'p',
      summary:
        'Specify server port. Note if the port is already being used, Vite will automatically try the next available port so this may not be the actual port the server ends up listening on.',
    }),

    open: Flags.boolean({
      char: 'o',
      summary:
        'Open the browser window automatically.  If you want to open the server in a specific browser you like, you can set the env process.env.BROWSER (e.g. firefox).',
    }),

    test: Flags.string({
      char: 't',
      multiple: true,
    }),
  }

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Compile)

    p.intro(chalk.bgHex('#2975d1')(' publicodes dev '))
    const filesToCompile: string[] =
      argv.length === 0
        ? // TODO: test with production package
          (this.config.pjson?.publicodes?.files ?? ['src/'])
        : argv

    const testFiles: string[] = !flags.test?.length
      ? // TODO: test with production package
        (this.config.pjson?.publicodes?.test ?? ['test/'])
      : flags.test

    // quickDoc is in the current package (@publicodes/tools) under the folder /quick-doc

    const quickDocPath = import.meta.url
      .replace('file://', '')
      .replace('dist/commands/dev.js', 'quick-doc')

    console.log(quickDocPath, import.meta.url)

    const server = await createDevServer(
      filesToCompile,
      testFiles,
      quickDocPath,
      flags as any,
    )
    // Handle process termination
    let isShuttingDown = false
    const cleanup = async () => {
      if (isShuttingDown) return
      isShuttingDown = true
      p.outro(chalk.bgHex('#2975d1')(' shutting down publicodes dev server '))
      await server.close()
      process.exit(0)
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    await server
  }
}
