#!/usr/bin/env node

import { execute } from '@oclif/core'

console.log('Running the CLI:', import.meta.url)
await execute({ dir: import.meta.url })
