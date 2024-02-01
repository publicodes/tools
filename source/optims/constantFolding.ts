import Engine, {
  reduceAST,
  ParsedRules,
  transformAST,
  traverseASTNode,
  Unit,
  EvaluatedNode,
  utils,
} from 'publicodes'
import type { RuleNode, ASTNode } from 'publicodes'
import { RuleName } from '../commons'

type RefMap = Map<RuleName, Set<RuleName> | undefined>

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
   * The rules that are evaluated with a modified situation (in a [contexte]
   * mechanism or with a [remplacement]) and we don't want to be folded.
   *
   * @example
   * ```
   * rule:
   *	  valeur: rule2
   *	  contexte:
   *	    rule3: 10
   *	    rule4: 20
   * ...
   * ```
   * In this case, we don't want to fold [rule2] because it's evaluated with a
   * modified situation (unless it's a constant). We also don't want to fold
   * [rule3] and [rule4] because they are used in the contexte of [rule].
   */
  unfoldableRules: Set<RuleName>
}

function addMapEntry(map: RefMap, key: RuleName, values: RuleName[]) {
  let vals = map.get(key)
  if (vals) {
    values.forEach((val) => vals.add(val))
  }
  map.set(key, vals || new Set(values))
}

function initFoldingCtx(
  engine: Engine,
  toKeep?: PredicateOnRule,
  foldingParams?: FoldingParams,
): FoldingCtx {
  const refs: RefMaps = {
    parents: new Map(),
    childs: new Map(),
  }
  const unfoldableRules = new Set<RuleName>()
  // // PERF: could it be avoided?
  // JSON.parse(JSON.stringify(engine.baseContext.parsedRules))

  const parsedRules = copyFullParsedRules(engine)

  // NOTE: we need to traverse the AST to find all the references of a rule.
  // We can't use the [referencesMap] from the engine's context because it
  // contains references to rules that are beyond the scope of the current
  // rule.
  for (const ruleName in parsedRules) {
    const ruleNode = parsedRules[ruleName]

    if (ruleNode.replacements.length > 0) {
      unfoldableRules.add(ruleName)
      ruleNode.replacements.forEach((replacement) => {
        unfoldableRules.add(replacement.replacedReference.name)
      })
    }

    const reducedAST =
      reduceAST(
        (acc: Set<RuleName>, node: ASTNode) => {
          if (node.nodeKind === 'contexte') {
            const { missingVariables } = engine.evaluateNode(node)

            // We can't fold it
            if (Object.keys(missingVariables).length !== 0) {
              unfoldableRules.add(ruleName)
              node.explanation.contexte.forEach(([ref, _]) => {
                unfoldableRules.add(ref.dottedName)
              })
            }
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
      (name) => !name.endsWith('$SITUATION'),
    )

    if (traversedVariables.length > 0) {
      addMapEntry(refs.childs, ruleName, traversedVariables)
      traversedVariables.forEach((traversedVar) => {
        addMapEntry(refs.parents, traversedVar, [ruleName])
      })
    }
  }

  return {
    engine,
    parsedRules,
    refs,
    toKeep,
    unfoldableRules,
    params: {
      isFoldedAttr: foldingParams?.isFoldedAttr ?? 'optimized',
    },
  }
}

const unfoldableAttr = ['par défaut', 'question']

function isFoldable(ctx: FoldingCtx, rule: RuleNode): boolean {
  let childInContext = false
  const childs = ctx.refs.childs.get(rule.dottedName)

  childs?.forEach((child) => {
    if (ctx.unfoldableRules.has(child)) {
      childInContext = true
      return
    }
  })

  return (
    rule !== undefined &&
    !unfoldableAttr.find((attr) => attr in rule.rawNode) &&
    !ctx.unfoldableRules.has(rule.dottedName) &&
    !childInContext
  )
}

function isEmptyRule(rule: RuleNode): boolean {
  return Object.keys(rule.rawNode).length === 0
}

/** Replaces all references in parent refs of [ruleName] by its [constantNode] */
function searchAndReplaceConstantValueInParentRefs(
  ctx: FoldingCtx,
  ruleName: RuleName,
  constantNode: ASTNode,
): void {
  const refs = ctx.refs.parents.get(ruleName)

  if (refs) {
    for (const parentName of refs) {
      const parentRule = ctx.parsedRules[parentName]

      if (isFoldable(ctx, parentRule)) {
        const newRule = traverseASTNode(
          transformAST((node, _) => {
            if (node.nodeKind === 'reference' && node.dottedName === ruleName) {
              return constantNode
            }
          }),
          parentRule,
        ) as RuleNode

        if (newRule !== undefined) {
          ctx.parsedRules[parentName] = newRule
          ctx.parsedRules[parentName].rawNode[ctx.params.isFoldedAttr] =
            'partially'
          removeInMap(ctx.refs.parents, ruleName, parentName)
        }
      }
    }
  }
}

function isAlreadyFolded(params: FoldingParams, rule: RuleNode): boolean {
  return (
    'rawNode' in rule &&
    params.isFoldedAttr in rule.rawNode &&
    rule.rawNode[params.isFoldedAttr] === 'fully'
  )
}

function removeInMap<K, V>(map: Map<K, Set<V>>, key: K, val: V) {
  if (map.has(key)) {
    map.get(key).delete(val)
  }
}

function removeRuleFromRefs(ref: RefMap, ruleName: RuleName) {
  for (const rule of ref.keys()) {
    removeInMap(ref, rule, ruleName)
  }
}

function deleteRule(ctx: FoldingCtx, dottedName: RuleName): void {
  const ruleNode = ctx.parsedRules[dottedName]
  if (
    (ctx.toKeep === undefined || !ctx.toKeep([dottedName, ruleNode])) &&
    isFoldable(ctx, ruleNode)
  ) {
    removeRuleFromRefs(ctx.refs.parents, dottedName)
    removeRuleFromRefs(ctx.refs.childs, dottedName)
    delete ctx.parsedRules[dottedName]
    ctx.refs.parents.delete(dottedName)
    ctx.refs.childs.delete(dottedName)
  }
}

/** Removes the [parentRuleName] as a parent dependency of each [childRuleNamesToUpdate]. */
function updateRefCounting(
  ctx: FoldingCtx,
  parentRuleName: RuleName,
  ruleNamesToUpdate: Set<RuleName>,
) {
  for (const ruleNameToUpdate of ruleNamesToUpdate) {
    removeInMap(ctx.refs.parents, ruleNameToUpdate, parentRuleName)
    if (ctx.refs.parents.get(ruleNameToUpdate)?.size === 0) {
      deleteRule(ctx, ruleNameToUpdate)
    }
  }
}

function replaceRuleWithEvaluatedNodeValue(
  rule: RuleNode,
  nodeValue: number | boolean | string | Record<string, unknown>,
  unit: Unit | undefined,
): ASTNode {
  const constantNode: ASTNode = {
    nodeValue,
    type:
      typeof nodeValue === 'number'
        ? 'number'
        : typeof nodeValue === 'boolean'
        ? 'boolean'
        : typeof nodeValue === 'string'
        ? 'string'
        : undefined,

    nodeKind: 'constant',
    missingVariables: {},
    rawNode: {
      valeur: nodeValue,
    },
    isNullable: false,
  }
  const explanationThen: ASTNode =
    unit !== undefined
      ? {
          nodeKind: 'unité',
          unit,
          explanation: constantNode,
        }
      : constantNode

  if (rule.explanation.valeur.nodeKind === 'contexte') {
    // We remove the contexte as it's now considered as a constant.
    rule.explanation.valeur = rule.explanation.valeur.explanation.node
  }

  rule.explanation.valeur = traverseASTNode(
    transformAST((node, _) => {
      if (node.nodeKind === 'condition') {
        /* we found the first condition, which wrapped the rule in the form of:
         *
         * - si:
         *   est non défini: <rule> . $SITUATION
         * - alors: <rule>
         * - sinon: <rule> . $SITUATION
         */
        node.explanation.alors = explanationThen
        return node
      }
    }),
    rule,
  )

  return explanationThen
}

function isNullable(node: ASTNode): boolean {
  // @ts-ignore
  if (node?.explanation?.nullableParent !== undefined) {
    return true
  }

  return reduceAST(
    // @ts-ignore
    (_, node) => {
      if (!node) {
        return false
      }

      //@ts-ignore
      if (node?.explanation?.nullableParent !== undefined) {
        return true
      }
    },
    false,
    // We expect a reference node here
    // @ts-ignore
    node?.explanation?.valeur,
  )
}

function fold(ctx: FoldingCtx, ruleName: RuleName, rule: RuleNode): void {
  if (
    rule !== undefined &&
    (!isFoldable(ctx, rule) ||
      !utils.isAccessible(ctx.parsedRules, '', rule.dottedName) ||
      isAlreadyFolded(ctx.params, rule) ||
      !(ruleName in ctx.parsedRules))
  ) {
    return
  }

  const ruleParents = ctx.refs.parents.get(ruleName)
  if (
    isEmptyRule(rule) &&
    (ruleParents === undefined || ruleParents?.size === 0)
  ) {
    // Empty rule with no parent
    deleteRule(ctx, ruleName)
    return
  }

  const evaluation: ASTNode & EvaluatedNode = ctx.engine.evaluate(
    rule.dottedName,
  )
  const { missingVariables, nodeValue, unit } = evaluation
  const missingVariablesNames = Object.keys(missingVariables)

  if (
    missingVariablesNames.length === 0 &&
    // We don't want to fold a rule which can be nullable with a different situation.
    // For example, if its namespace is conditionnaly applicable.
    !isNullable(evaluation)
  ) {
    const constantNode = replaceRuleWithEvaluatedNodeValue(
      rule,
      nodeValue,
      unit,
    )

    searchAndReplaceConstantValueInParentRefs(ctx, ruleName, constantNode)
    if (ctx.parsedRules[ruleName] === undefined) {
      return
    }

    const childs = ctx.refs.childs.get(ruleName) ?? new Set()

    updateRefCounting(ctx, ruleName, childs)
    delete ctx.parsedRules[ruleName].rawNode.formule

    if (ctx.refs.parents.get(ruleName)?.size === 0) {
      deleteRule(ctx, ruleName)
    } else {
      ctx.parsedRules[ruleName].rawNode[ctx.params.isFoldedAttr] = 'fully'
    }

    return
  }
}

/**
 * Deep copies the private [parsedRules] field of [engine] (without the '$SITUATION'
 * rules).
 */
function copyFullParsedRules(engine: Engine): ParsedRules<RuleName> {
  const parsedRules: ParsedRules<RuleName> = {}

  for (const ruleName in engine.baseContext.parsedRules) {
    if (!ruleName.endsWith('$SITUATION')) {
      parsedRules[ruleName] = structuredClone(
        engine.baseContext.parsedRules[ruleName],
      )
    }
  }

  return parsedRules
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
  let ctx = initFoldingCtx(engine, toKeep, params)

  let nbRules = Object.keys(ctx.parsedRules).length
  let nbRulesBefore = undefined

  while (nbRules !== nbRulesBefore) {
    for (const ruleName in ctx.parsedRules) {
      const ruleNode = ctx.parsedRules[ruleName]

      if (isFoldable(ctx, ruleNode) && !isAlreadyFolded(ctx.params, ruleNode)) {
        fold(ctx, ruleName, ruleNode)
      }
    }
    nbRulesBefore = nbRules
    nbRules = Object.keys(ctx.parsedRules).length
  }

  if (toKeep) {
    for (const ruleName in ctx.parsedRules) {
      const ruleNode = ctx.parsedRules[ruleName]
      const parents = ctx.refs.parents.get(ruleName)

      if (
        isFoldable(ctx, ruleNode) &&
        !toKeep([ruleName, ruleNode]) &&
        (!parents || parents?.size === 0)
      ) {
        delete ctx.parsedRules[ruleName]
      }
    }
  }

  return ctx.parsedRules
}
