import Engine, { reduceAST, ParsedRules, parseExpression } from 'publicodes'
import type { RuleNode, ASTNode, Unit } from 'publicodes'
import {
  RuleName,
  serializeParsedExprAST,
  substituteInParsedExpr,
} from '../commons'

type RefMap = Map<
  RuleName,
  // NOTE: It's an array but it's built from a Set, so no duplication
  RuleName[] | undefined
>

type RefMaps = {
  parents: RefMap
  childs: RefMap
}

export type PredicateOnRule = (rule: [RuleName, RuleNode]) => boolean

export type FoldingParams = {
  // The attribute name to use to mark a rule as folded, default to 'optimized'.
  isFoldedAttr?: string
}

type FoldingCtx = {
  engine: Engine
  parsedRules: ParsedRules<RuleName>
  refs: RefMaps
  toKeep?: PredicateOnRule
  params: FoldingParams
  /**
   * The rules that are evaluated with a modified situation (in a [recalcul] mechanism)
   * and we don't want to be folded.
   *
   * @example
   * ```
   * rule:
   *   recalcul:
   *	    règle: rule2
   *	    avec:
   *	      rule3: 10
   *	      rule4: 20
   * ...
   * ```
   * In this case, [rule2] should not be folded.
   */
  recalculRules: Set<RuleName>
}

function addMapEntry(map: RefMap, key: RuleName, values: RuleName[]) {
  let vals = map.get(key)
  if (vals) {
    vals = vals.concat(values)
  }
  map.set(key, vals || values)
}

function initFoldingCtx(
  engine: Engine,
  parsedRules: ParsedRules<RuleName>,
  toKeep?: PredicateOnRule,
  foldingParams?: FoldingParams,
): FoldingCtx {
  const refs: RefMaps = {
    parents: new Map(),
    childs: new Map(),
  }
  const recalculRules = new Set<RuleName>()

  Object.entries(parsedRules).forEach(([ruleName, ruleNode]) => {
    const reducedAST =
      reduceAST(
        (acc: Set<RuleName>, node: ASTNode) => {
          if (
            node.nodeKind === 'recalcul' &&
            'dottedName' in node.explanation.recalculNode
          ) {
            recalculRules.add(node.explanation.recalculNode.dottedName)
          }
          if (
            node.nodeKind === 'reference' &&
            'dottedName' in node &&
            node.dottedName !== ruleName
          ) {
            return acc.add(node.dottedName)
          }
        },
        new Set(),
        ruleNode.explanation.valeur,
      ) ?? new Set()
    const traversedVariables: RuleName[] = Array.from(reducedAST).filter(
      (name) => !name.endsWith(' . $SITUATION'),
    )

    if (traversedVariables.length > 0) {
      addMapEntry(refs.childs, ruleName, traversedVariables)
      traversedVariables.forEach((traversedVar) => {
        addMapEntry(refs.parents, traversedVar, [ruleName])
      })
    }
  })

  return {
    engine,
    parsedRules,
    refs,
    toKeep,
    recalculRules,
    params: { isFoldedAttr: foldingParams?.isFoldedAttr ?? 'optimized' },
  }
}

function isFoldable(
  rule: RuleNode | undefined,
  recalculRules: Set<RuleName>,
): boolean {
  if (!rule) {
    return false
  }

  const rawNode = rule.rawNode
  return !(
    recalculRules.has(rule.dottedName) ||
    'question' in rawNode ||
    // NOTE(@EmileRolley): I assume that a rule can have a [par défaut] attribute without a [question] one.
    // The behavior could be specified.
    'par défaut' in rawNode ||
    'applicable si' in rawNode ||
    'non applicable si' in rawNode
  )
}

function isInParsedRules(
  parsedRules: ParsedRules<RuleName>,
  rule: RuleName,
): boolean {
  return Object.keys(parsedRules).includes(rule)
}

function isEmptyRule(rule: RuleNode): boolean {
  // There is always a 'nom' attribute.
  return Object.keys(rule.rawNode).length <= 1
}

function formatPublicodesUnit(unit?: Unit): string {
  if (
    unit !== undefined &&
    unit.numerators.length === 1 &&
    unit.numerators[0] === '%'
  ) {
    return '%'
  }
  return ''
}

// Replaces boolean values by their string representation in French.
function formatToPulicodesValue(value: any, unit?: Unit) {
  if (typeof value === 'boolean') {
    return value ? 'oui' : 'non'
  }

  return value + formatPublicodesUnit(unit)
}

function replaceAllRefs(
  str: string,
  refName: string,
  constantValue: any,
  currentRuleName: string,
): string {
  const parsedExpression = parseExpression(str, currentRuleName)
  const newParsedExpression = substituteInParsedExpr(
    parsedExpression,
    refName,
    constantValue,
  )
  return serializeParsedExprAST(newParsedExpression)
}

function lexicalSubstitutionOfRefValue(
  parent: RuleNode,
  constant: RuleNode,
): RuleNode | undefined {
  // Retrieves the name form used in the rule. For exemple, the rule 'root . a
  // . b' could have the name 'b', 'a . b' or 'root . a . b'.
  const refName = reduceAST<string>(
    (_, node: ASTNode) => {
      if (
        node.nodeKind === 'reference' &&
        node.dottedName === constant.dottedName
      ) {
        return node.name
      }
    },
    '',
    parent,
  )

  const constValue = formatToPulicodesValue(constant.rawNode.valeur)

  if ('formule' in parent.rawNode) {
    if (typeof parent.rawNode.formule === 'string') {
      const newFormule = replaceAllRefs(
        parent.rawNode.formule,
        refName,
        constValue,
        constant.dottedName,
      )
      parent.rawNode.formule = newFormule
      return parent
    } else if ('somme' in parent.rawNode.formule) {
      // TODO: needs to be abstracted
      parent.rawNode.formule.somme = (
        parent.rawNode.formule.somme as (string | number)[]
      ).map((expr: string | number) => {
        return typeof expr === 'string'
          ? replaceAllRefs(expr, refName, constValue, constant.dottedName)
          : expr
      })
      return parent
    }
  }
  // When a rule defined as an unique string: 'var * var2', it's parsed as a [valeur] attribute not a [formule].
  if (typeof parent.rawNode.valeur === 'string') {
    parent.rawNode.formule = replaceAllRefs(
      parent.rawNode.valeur,
      refName,
      constValue,
      constant.dottedName,
    )
    delete parent.rawNode.valeur
    return parent
  }
}

/** Replaces all references in parent refs of [ruleName] by its [rule.valeur] */
function searchAndReplaceConstantValueInParentRefs(
  ctx: FoldingCtx,
  ruleName: RuleName,
  rule: RuleNode,
): FoldingCtx {
  const refs = ctx.refs.parents.get(ruleName)

  if (refs) {
    // console.time('<<<<<<<<<< searchAndReplaceConstantValueInParentRefs')
    // for (const parentName of refs) {
    //   let parentRule = ctx.parsedRules[parentName]
    //
    //   if (isFoldable(parentRule, ctx.recalculRules)) {
    //     const newRule = lexicalSubstitutionOfRefValue(parentRule, rule)
    //
    //     if (newRule !== undefined) {
    //       parentRule = newRule
    //       parentRule.rawNode[ctx.params.isFoldedAttr] = true
    //       removeInMap(ctx.refs.parents, ruleName, parentName)
    //     }
    //   }
    // }
    refs
      .map((dottedName) => ctx.parsedRules[dottedName])
      .filter((rule) => {
        return isFoldable(rule, ctx.recalculRules)
      })
      .forEach((parentRule) => {
        const parentName = parentRule.dottedName
        const newRule = lexicalSubstitutionOfRefValue(parentRule, rule)
        if (newRule !== undefined) {
          parentRule = newRule
          parentRule.rawNode[ctx.params.isFoldedAttr] = true
          removeInMap(ctx.refs.parents, ruleName, parentName)
        }
      })
    // console.timeEnd('<<<<<<<<<< searchAndReplaceConstantValueInParentRefs')
  }

  return ctx
}

function isAlreadyFolded(params: FoldingParams, rule: RuleNode): boolean {
  return 'rawNode' in rule && params.isFoldedAttr in rule.rawNode
}

/**
 * Subsitutes [parentRuleNode.formule] ref constant from [refs].
 *
 * @note It folds child rules in [refs] if possible.
 */
function replaceAllPossibleChildRefs(ctx: FoldingCtx, refs: RuleName[]) {
  if (refs) {
    for (const childName of refs) {
      const childNode = ctx.parsedRules[childName]

      if (
        childNode &&
        isFoldable(childNode, ctx.recalculRules) &&
        !isAlreadyFolded(ctx.params, childNode)
      ) {
        tryToFoldRule(ctx, childName, childNode)
      }
    }
  }
}

export function removeInMap<K, V>(
  map: Map<K, V[]>,
  key: K,
  val: V,
): Map<K, V[]> {
  return map.set(
    key,
    (map.get(key) ?? []).filter((v) => v !== val),
  )
}

function removeRuleFromRefs(ref: RefMap, ruleName: RuleName) {
  ref.forEach((_, rule) => {
    removeInMap(ref, rule, ruleName)
  })
}

function deleteRule(ctx: FoldingCtx, dottedName: RuleName): FoldingCtx {
  const ruleNode = ctx.parsedRules[dottedName]
  if (
    (ctx.toKeep === undefined || !ctx.toKeep([dottedName, ruleNode])) &&
    isFoldable(ruleNode, ctx.recalculRules)
  ) {
    removeRuleFromRefs(ctx.refs.parents, dottedName)
    removeRuleFromRefs(ctx.refs.childs, dottedName)
    delete ctx.parsedRules[dottedName]
    ctx.refs.parents.delete(dottedName)
    ctx.refs.childs.delete(dottedName)
  }
  return ctx
}

/** Removes the [parentRuleName] as a parent dependency of each [childRuleNamesToUpdate]. */
function updateRefCounting(
  ctx: FoldingCtx,
  parentRuleName: RuleName,
  ruleNamesToUpdate: RuleName[],
): FoldingCtx {
  ruleNamesToUpdate.forEach((ruleNameToUpdate) => {
    removeInMap(ctx.refs.parents, ruleNameToUpdate, parentRuleName)
    if (ctx.refs.parents.get(ruleNameToUpdate)?.length === 0) {
      ctx = deleteRule(ctx, ruleNameToUpdate)
    }
  })
  return ctx
}

function tryToFoldRule(
  ctx: FoldingCtx,
  ruleName: RuleName,
  rule: RuleNode,
): FoldingCtx {
  if (
    rule !== undefined &&
    (!isFoldable(rule, ctx.recalculRules) ||
      isAlreadyFolded(ctx.params, rule) ||
      !isInParsedRules(ctx.parsedRules, ruleName))
  ) {
    // Already managed rule
    return ctx
  }

  const ruleParents = ctx.refs.parents.get(ruleName)
  if (
    isEmptyRule(rule) &&
    (ruleParents === undefined || ruleParents?.length === 0)
  ) {
    // Empty rule with no parent
    deleteRule(ctx, ruleName)
    return ctx
  }

  const { nodeValue, missingVariables, traversedVariables, unit } =
    ctx.engine.evaluateNode(rule)

  const traversedVariablesWithoutSelf = traversedVariables.filter(
    (dottedName) => dottedName !== ruleName,
  )

  // NOTE(@EmileRolley): we need to evaluate due to possible standalone rule [formule]
  // parsed as a [valeur].
  if ('valeur' in rule.rawNode && traversedVariablesWithoutSelf?.length > 0) {
    rule.rawNode.formule = rule.rawNode.valeur
    delete rule.rawNode.valeur
  }

  const missingVariablesNames = Object.keys(missingVariables)

  // Constant leaf -> search and replace the constant in all its parents.
  if (
    'valeur' in rule.rawNode ||
    ('formule' in rule.rawNode && missingVariablesNames.length === 0)
  ) {
    if ('formule' in rule.rawNode) {
      ctx.parsedRules[ruleName].rawNode.valeur = formatToPulicodesValue(
        nodeValue,
        unit,
      )
    }

    ctx = searchAndReplaceConstantValueInParentRefs(ctx, ruleName, rule)
    if (ctx.parsedRules[ruleName] === undefined) {
      return ctx
    }

    if ('formule' in rule.rawNode) {
      // The rule do not depends on any other rule anymore, so we need to remove
      // it from the [refs].
      const childs = ctx.refs.childs.get(ruleName) ?? []

      ctx = updateRefCounting(
        ctx,
        ruleName,
        // NOTE(@EmileRolley): for some reason, the [traversedVariables] are not always
        // depencies of the rule. Consequently, we need to keep only the ones that are
        // in the [childs] list in order to avoid removing rules that are not dependencies.
        traversedVariablesWithoutSelf?.filter((v: RuleName) =>
          childs.includes(v),
        ) ?? [],
      )
      delete ctx.parsedRules[ruleName].rawNode.formule
    }

    if (ctx.refs.parents.get(ruleName)?.length === 0) {
      // NOTE(@EmileRolley): temporary work around until all mechanisms are supported.
      // Indeed, when replacing a leaf ref by its value in all its parents,
      // it should always be removed.
      deleteRule(ctx, ruleName)
    } else {
      ctx.parsedRules[ruleName].rawNode[ctx.params.isFoldedAttr] = true
    }

    return ctx
  } else if ('formule' in rule.rawNode) {
    // Try to replace internal refs if possible.
    const childs = ctx.refs.childs.get(ruleName)
    if (childs?.length > 0) {
      replaceAllPossibleChildRefs(ctx, childs)
    }
  }
  return ctx
}

/**
 * Applies a constant folding optimisation pass on parsed rules of [engine].
 *
 * @param engine The engine instantiated with the rules to fold.
 * @param toKeep A predicate that returns true if the rule should be kept, if not present,
 * all folded rules will be kept.
 * @param params The folding parameters.
 *
 * @returns The parsed rules with constant folded rules.
 */
export function constantFolding(
  engine: Engine,
  toKeep?: PredicateOnRule,
  params?: FoldingParams,
): ParsedRules<RuleName> {
  const parsedRules: ParsedRules<RuleName> =
    // PERF: could it be avoided?
    JSON.parse(JSON.stringify(engine.getParsedRules()))

  let ctx: FoldingCtx = initFoldingCtx(engine, parsedRules, toKeep, params)

  Object.entries(ctx.parsedRules).forEach(([ruleName, ruleNode]) => {
    if (
      isFoldable(ruleNode, ctx.recalculRules) &&
      !isAlreadyFolded(ctx.params, ruleNode)
    ) {
      ctx = tryToFoldRule(ctx, ruleName, ruleNode)
    }
  })

  if (toKeep) {
    ctx.parsedRules = Object.fromEntries(
      Object.entries(ctx.parsedRules).filter(([ruleName, ruleNode]) => {
        const parents = ctx.refs.parents.get(ruleName)
        return (
          !isFoldable(ruleNode, ctx.recalculRules) ||
          toKeep([ruleName, ruleNode]) ||
          parents?.length > 0
        )
      }),
    )
  }

  return ctx.parsedRules
}
