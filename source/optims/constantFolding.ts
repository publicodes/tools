import Engine, {
  reduceAST,
  ParsedRules,
  transformAST,
  traverseASTNode,
  Unit,
} from 'publicodes'
import type { RuleNode, ASTNode } from 'publicodes'
import { getAllRefsInNode, RuleName } from '../commons'

type RefMap = Map<
  RuleName,
  // NOTE: It's an array but it's built from a Set, so no duplication
  Set<RuleName> | undefined
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
   * The rules that are evaluated with a modified situation (in a [contexte] mechanism)
   * and we don't want to be folded.
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
   * In this case, [rule2] should not be folded (and all its dependencies
   * should not be folded!).
   *
   * TODO(@EmileRolley): currently, all childs of a rule with a [contexte]
   * mechanism are not folded. However, it could be smarter to keep track of
   * each contexte rules and fold the child rules that are not impacted by the
   * contexte. For now we choose to keep it simple and to over-fold instead of
   * taking the risk to alter the result.
   */
  impactedByContexteRules: Set<RuleName>
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
  parsedRules: ParsedRules<RuleName>,
  toKeep?: PredicateOnRule,
  foldingParams?: FoldingParams,
): FoldingCtx {
  const refs: RefMaps = {
    parents: new Map(),
    childs: new Map(),
  }
  const impactedByContexteRules = new Set<RuleName>()

  // NOTE: we need to traverse the AST to find all the references of a rule.
  // We can't use the [referencesMap] from the engine's context because it
  // contains references to rules that are beyond the scope of the current
  // rule.
  for (const ruleName in parsedRules) {
    const ruleNode = parsedRules[ruleName]
    const reducedAST =
      reduceAST(
        (acc: Set<RuleName>, node: ASTNode) => {
          if (node.nodeKind === 'contexte') {
            const { missingVariables } = engine.evaluateNode(node)

            // We can't fold it
            if (Object.keys(missingVariables).length !== 0) {
              // Find all rule references impacted by the contexte in the rule node
              const impactedRules = getAllRefsInNodeImpactedByContexte(
                ruleName,
                node,
                node.explanation.contexte.map(([ref, _]) => ref.dottedName),
              )

              impactedRules.forEach((rule) => impactedByContexteRules.add(rule))
              impactedByContexteRules.add(ruleName)
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
      (name) => !name.endsWith(' . $SITUATION'),
    )

    if (traversedVariables.length > 0) {
      addMapEntry(refs.childs, ruleName, traversedVariables)
      traversedVariables.forEach((traversedVar) => {
        addMapEntry(refs.parents, traversedVar, [ruleName])
      })
    }
  }

  // All childs of a rule impacted by a contexte rule are also impacted.
  //
  // NOTE(@EmileRolley): contexte rule will be added in the contextRules set.
  // Therefore, they won't be marked as folded. It's a wanted behavior? Not sure.
  //
  // WARN(@EmileRolley): the [impactedByContexteRules] is updated while
  // iterating it's convenient but the semantics may vary depending on the
  // javascript runtime used.
  for (const ruleName of impactedByContexteRules) {
    refs.childs
      .get(ruleName)
      ?.forEach((rule) => impactedByContexteRules.add(rule))
  }

  return {
    engine,
    parsedRules,
    refs,
    toKeep,
    impactedByContexteRules,
    params: {
      isFoldedAttr: foldingParams?.isFoldedAttr ?? 'optimized',
    },
  }
}

function getAllRefsInNodeImpactedByContexte(
  ruleName: RuleName,
  node: ASTNode,
  contexteRefs: RuleName[],
): RuleName[] {
  const impactedRules = getAllRefsInNode(node).filter((ref) => {
    return (
      ref !== ruleName &&
      !ref.endsWith(' . $SITUATION') &&
      !contexteRefs.includes(ref)
    )
  })

  return impactedRules
}

function isFoldable(
  rule: RuleNode | undefined,
  contextRules: Set<RuleName>,
): boolean {
  if (!rule) {
    return false
  }

  const rawNode = rule.rawNode

  return !(contextRules.has(rule.dottedName) || 'question' in rawNode)
}

function isEmptyRule(rule: RuleNode): boolean {
  return Object.keys(rule.rawNode).length === 0
}

function lexicalSubstitutionOfRefValue(
  parent: RuleNode,
  constant: RuleNode,
): RuleNode | undefined {
  const newNode = traverseASTNode(
    transformAST((node, _) => {
      if (
        node.nodeKind === 'reference' &&
        node.dottedName === constant.dottedName
      ) {
        if (constant.explanation.valeur.nodeKind === 'condition') {
          return constant.explanation.valeur.explanation.alors
        } else if (
          constant.explanation.valeur.nodeKind === 'unité' &&
          constant.explanation.valeur.explanation.nodeKind === 'condition'
        ) {
          return constant.explanation.valeur.explanation.explanation.alors
        } else {
          throw new Error(
            `[lexicalSubstitutionOfRefValue]: constant node is expected to be a condition. Got ${constant.explanation.valeur.nodeKind} for the rule ${constant.dottedName}`,
          )
        }
      }
    }),
    parent,
  )

  return newNode as RuleNode
}

/** Replaces all references in parent refs of [ruleName] by its [rule.valeur] */
function searchAndReplaceConstantValueInParentRefs(
  ctx: FoldingCtx,
  ruleName: RuleName,
  rule: RuleNode,
): void {
  const refs = ctx.refs.parents.get(ruleName)

  if (refs) {
    for (const parentName of refs) {
      const parentRule = ctx.parsedRules[parentName]

      if (isFoldable(parentRule, ctx.impactedByContexteRules)) {
        const newRule = lexicalSubstitutionOfRefValue(parentRule, rule)
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
    isFoldable(ruleNode, ctx.impactedByContexteRules)
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
) {
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

  /*
   * The engine parse all rules into a root condition:
   *
   * - si:
   *   est non défini: <rule> . $SITUATION
   * - alors: <rule>
   * - sinon: <rule> . $SITUATION
   */
  if (rule.explanation.valeur.nodeKind === 'condition') {
    rule.explanation.valeur.explanation.alors = explanationThen
  } else if (
    rule.explanation.valeur.nodeKind === 'unité' &&
    rule.explanation.valeur.explanation.nodeKind === 'condition'
  ) {
    rule.explanation.valeur.explanation.explanation.alors = explanationThen
  } else if (
    rule.explanation.valeur.nodeKind === 'arrondi' &&
    rule.explanation.valeur.explanation.valeur.nodeKind === 'condition'
  ) {
    rule.explanation.valeur.explanation.valeur.explanation.alors =
      explanationThen
  } else {
    throw new Error(
      `[replaceRuleWithEvaluatedNodeValue]: root rule are expected to be a condition. Got ${rule.explanation.valeur.nodeKind} for the rule ${rule.dottedName}`,
    )
  }
}

function fold(ctx: FoldingCtx, ruleName: RuleName, rule: RuleNode): void {
  if (
    rule !== undefined &&
    (!isFoldable(rule, ctx.impactedByContexteRules) ||
      isAlreadyFolded(ctx.params, rule) ||
      !(ruleName in ctx.parsedRules))
  ) {
    // Already managed rule
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

  const { missingVariables, nodeValue, unit } = ctx.engine.evaluateNode(rule)

  const missingVariablesNames = Object.keys(missingVariables)

  // Constant leaf -> search and replace the constant in all its parents.
  if (missingVariablesNames.length === 0) {
    replaceRuleWithEvaluatedNodeValue(rule, nodeValue, unit)

    searchAndReplaceConstantValueInParentRefs(ctx, ruleName, rule)
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
  console.time('deepCopy')
  const parsedRules: ParsedRules<RuleName> =
    // PERF: could it be avoided?
    JSON.parse(JSON.stringify(engine.getParsedRules()))
  console.timeEnd('deepCopy')

  console.time('initFoldingCtx')
  let ctx = initFoldingCtx(engine, parsedRules, toKeep, params)
  console.timeEnd('initFoldingCtx')

  let nbRules = Object.keys(ctx.parsedRules).length
  let nbRulesBefore = undefined

  console.time(`fold`)
  while (nbRules !== nbRulesBefore) {
    for (const ruleName in ctx.parsedRules) {
      const ruleNode = ctx.parsedRules[ruleName]

      if (
        isFoldable(ruleNode, ctx.impactedByContexteRules) &&
        !isAlreadyFolded(ctx.params, ruleNode)
      ) {
        fold(ctx, ruleName, ruleNode)
      }
    }
    nbRulesBefore = nbRules
    nbRules = Object.keys(ctx.parsedRules).length
  }
  console.timeEnd(`fold`)

  if (toKeep) {
    console.time('filter')
    for (const ruleName in ctx.parsedRules) {
      const ruleNode = ctx.parsedRules[ruleName]
      const parents = ctx.refs.parents.get(ruleName)

      if (
        isFoldable(ruleNode, ctx.impactedByContexteRules) &&
        !toKeep([ruleName, ruleNode]) &&
        (!parents || parents?.size === 0)
      ) {
        delete ctx.parsedRules[ruleName]
      }
    }
    console.timeEnd('filter')
  }

  return ctx.parsedRules
}
