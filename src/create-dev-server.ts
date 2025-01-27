// src/quick-doc/dev-server.ts
import { createServer } from 'vite'
import { watch } from 'chokidar'
import { getModelFromSource, normalizeSourcePaths } from './compilation'
import type { RawRules } from './commons'
import * as p from '@clack/prompts'
import chalk from 'chalk'
import { runAsyncWithSpinner } from './utils/cli'
import tailwindcss from '@tailwindcss/vite'
import { Situation } from 'publicodes'
import { parse } from 'yaml'
import { readFile } from 'fs/promises'
import { sync } from 'glob'

type Options = {
  host?: string
  port?: number
  open?: boolean
}

type TestSituation = Record<string, Situation<string>>

/**
 * Extracts situations from a list of publicodes files.
 * @param files - An array of file paths to process
 * @returns A Promise that resolves to an array of DocSituation objects
 * @throws {Error} If file reading or parsing fails
 */
async function extractSituations(files: string[]): Promise<TestSituation> {
  const situations: TestSituation = {}

  const paths = sync(normalizeSourcePaths(files))
  for (const filePath of paths) {
    const content = parse(await readFile(filePath, 'utf-8'))

    // For each rule in the file
    for (const [ruleName, rule] of Object.entries(content)) {
      if (typeof rule === 'object' && rule !== null && 'contexte' in rule) {
        situations[ruleName] = rule.contexte as Situation<string>
      }
    }
  }

  return situations
}

export default async function createDevServer(
  modelFiles: string[],
  situationFiles: string[],
  quickDocPath: string,
  options: Options = {},
) {
  let currentRules: RawRules = {}
  let currentSituations: TestSituation = {}
  // Create server with spinner
  const vite = await runAsyncWithSpinner(
    'Starting Publicodes doc server...',
    'Server ready',
    async (spinner) => {
      const server = await createServer({
        plugins: [
          {
            name: 'publicodes-hot-reload',
            configureServer(server) {
              server.ws.on('connection', () => {
                p.log.info('Client connected to hot reload')
              })
            },
            transform(code, id) {
              if (id.endsWith('engine.ts')) {
                return {
                  code: code.replace(
                    '__INJECTED_RULES__',
                    JSON.stringify(currentRules),
                  ),
                  map: null,
                }
              }
              if (id.endsWith('situations.ts')) {
                return {
                  code: code.replace(
                    '__INJECTED_SITUATIONS__',
                    JSON.stringify(currentSituations),
                  ),
                  map: null,
                }
              }
            },
          },
          tailwindcss(),
        ],
        root: quickDocPath,
        server: {
          host: options.host,
          port: options.port,
        },
      })
      return server
    },
  )

  // Setup file watcher with pretty logs
  const modelWatcher = watch(modelFiles, {
    persistent: true,
    ignoreInitial: false,
  })

  let compilationCount = 0

  modelWatcher.on('all', async (event, path) => {
    if (event === 'add' || event === 'change') {
      const timestamp = new Date().toLocaleTimeString()
      compilationCount++

      try {
        if (compilationCount > 1) {
          p.log.info(
            `${chalk.dim(timestamp)} ${chalk.green('⚡')} ${chalk.blue('publicodes')} ${
              event === 'add' ? 'detected new file' : 'recompiling'
            } ${chalk.dim(path)}`,
          )
        }
        const startTime = performance.now()
        const newRules = await getModelFromSource(modelFiles, {
          logger: {
            log: p.log.info,
            error: p.log.error,
            warn: p.log.warn,
          },
        })
        const endTime = performance.now()

        currentRules = newRules

        // Notify clients
        vite.ws.send({
          type: 'custom',
          event: 'rules-updated',
          data: newRules,
        })

        p.log.success(
          `${chalk.dim(timestamp)} ${chalk.green('✓')} compiled in ${chalk.bold(
            `${Math.round(endTime - startTime)}ms`,
          )} ${chalk.dim(`#${compilationCount}`)}`,
        )
      } catch (error) {
        p.log.error(
          `${chalk.dim(timestamp)} ${chalk.red('✗')} compilation failed:\n${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  })

  const situationsWatcher = watch(situationFiles, {
    persistent: true,
    ignoreInitial: false,
  })

  situationsWatcher.on('all', async (event, path) => {
    if (event === 'add' || event === 'change') {
      const timestamp = new Date().toLocaleTimeString()

      try {
        if (compilationCount > 1) {
          p.log.info(
            `${chalk.dim(timestamp)} ${chalk.green('⚡')} ${chalk.blue('publicodes')} ${
              event === 'add' ? 'detected new file' : 'reloading'
            } ${chalk.dim(path)}`,
          )
        }

        const newSituations = await extractSituations(situationFiles)
        currentSituations = newSituations

        // Notify clients
        vite.ws.send({
          type: 'custom',
          event: 'situations-updated',
          data: newSituations,
        })
        if (compilationCount > 1) {
          p.log.success(
            `${chalk.dim(timestamp)} ${chalk.green('✓')} situation reloaded`,
          )
        }
      } catch (error) {
        p.log.error(
          `${chalk.dim(timestamp)} ${chalk.red('✗')} reload failed:\n${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  })

  // Start server
  await vite.listen()
  const protocol = 'http'
  const { host, port } = vite.config.server
  const serverUrl = `${protocol}://${host ?? 'localhost'}:${port}`

  p.log.success(`
${chalk.green('✓')} Publicodes doc server running at:

  ${chalk.bold('Local:')}   ${chalk.cyan(serverUrl)}
`)

  if (options.open) {
    vite.openBrowser()
  }

  return vite
}
