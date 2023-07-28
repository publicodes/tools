import { RuleName, disabledLogger } from '../source/commons'
import Engine from 'publicodes'
import type { ParsedRules } from 'publicodes'

export function callWithEngine<R>(fn: (engine: Engine) => R, rawRules: any): R {
  const engine = new Engine(rawRules, { logger: disabledLogger })
  return fn(engine)
}

export function callWithParsedRules<R>(
  fn: (rules: ParsedRules<RuleName>) => R,
  rawRules: any,
): R {
  const engine = new Engine(rawRules)
  return fn(engine.getParsedRules())
}
