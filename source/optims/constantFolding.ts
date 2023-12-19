import Engine, {
  reduceAST,
  ParsedRules,
  parseExpression,
  serializeEvaluation,
} from 'publicodes'
import type { RuleNode, ASTNode, Unit } from 'publicodes'
import {
  getAllRefsInNode,
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
  const impactedByContexteRules = new Set<RuleName>()

  // NOTE: we need to traverse the AST to find all the references of a rule.
  // We can't use the [referencesMap] from the engine's context because it
  // contains references to rules that are beyond the scope of the current
  // rule.
  Object.entries(parsedRules).forEach(([ruleName, ruleNode]) => {
    const reducedAST =
      reduceAST(
        (acc: Set<RuleName>, node: ASTNode) => {
          if (node.nodeKind === 'contexte') {
            // Find all rule references impacted by the contexte in the rule node
            const impactedRules = getAllRefsInNodeImpactedByContexte(
              ruleName,
              node,
              node.explanation.contexte.map(([ref, _]) => ref.dottedName),
            )

            impactedRules.forEach((rule) => impactedByContexteRules.add(rule))
            impactedByContexteRules.add(ruleName)
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
    params: { isFoldedAttr: foldingParams?.isFoldedAttr ?? 'optimized' },
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

  return !(
    contextRules.has(rule.dottedName) ||
    'question' in rawNode ||
    // NOTE(@EmileRolley): I assume that a rule can have a [par défaut]
    // attribute without a [question] one. The behavior could be specified.
    'par défaut' in rawNode ||
    'applicable si' in rawNode ||
    'non applicable si' in rawNode
  )
}

function isEmptyRule(rule: RuleNode): boolean {
  return Object.keys(rule.rawNode).length === 0
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
  // const substituteAST = transformAST((node, transform) => {
  //   // if
  // })

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

  const constValue = constant.rawNode.valeur

  // NOTE: here we directly replace the [rawNode] as it's what we get back with [getRawNodes]
  // at the end.
  // Instead, we could transform the complete parsed rule and serialize it at the end.
  //
  // If I continue to transform directly the [rawNode] then I can use directly the
  // rules given to the engine and no need to make a deep copy therefore. We simply
  // need to add the dottedName info in the rawRule.
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
): void {
  const refs = ctx.refs.parents.get(ruleName)

  if (refs) {
    for (const parentName of refs) {
      let parentRule = ctx.parsedRules[parentName]

      if (isFoldable(parentRule, ctx.impactedByContexteRules)) {
        const newRule = lexicalSubstitutionOfRefValue(parentRule, rule)
        if (newRule !== undefined) {
          parentRule = newRule
          parentRule.rawNode[ctx.params.isFoldedAttr] = true
          removeInMap(ctx.refs.parents, ruleName, parentName)
        }
      }
    }
  }
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
        isFoldable(childNode, ctx.impactedByContexteRules) &&
        !isAlreadyFolded(ctx.params, childNode)
      ) {
        tryToFoldRule(ctx, childName, childNode)
      }
    }
  }
}

function removeInMap<K, V>(map: Map<K, V[]>, key: K, val: V) {
  if (map.has(key)) {
    map.set(
      key,
      map.get(key).filter((v) => v !== val),
    )
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
  ruleNamesToUpdate: RuleName[],
) {
  for (const ruleNameToUpdate of ruleNamesToUpdate) {
    removeInMap(ctx.refs.parents, ruleNameToUpdate, parentRuleName)
    if (ctx.refs.parents.get(ruleNameToUpdate)?.length === 0) {
      deleteRule(ctx, ruleNameToUpdate)
    }
  })
}

function tryToFoldRule(
  ctx: FoldingCtx,
  ruleName: RuleName,
  rule: RuleNode,
): void {
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
    (ruleParents === undefined || ruleParents?.length === 0)
  ) {
    // Empty rule with no parent
    deleteRule(ctx, ruleName)
    return
  }

  const { nodeValue, missingVariables, unit } = ctx.engine.evaluateNode(rule)

  if ('valeur' in rule.rawNode) {
    rule.rawNode.formule = rule.rawNode.valeur
    delete rule.rawNode.valeur
  }

  const missingVariablesNames = Object.keys(evaluatedNode.missingVariables)

  // Constant leaf -> search and replace the constant in all its parents.
  if (missingVariablesNames.length === 0) {
    ctx.parsedRules[ruleName].rawNode.valeur =
      serializeEvaluation(evaluatedNode)

    searchAndReplaceConstantValueInParentRefs(ctx, ruleName, rule)
    if (ctx.parsedRules[ruleName] === undefined) {
      return
    }

    if ('formule' in rule.rawNode) {
      // The rule do not depends on any other rule anymore, so we need to remove
      // it from the [refs].
      const childs = ctx.refs.childs.get(ruleName) ?? []

      updateRefCounting(ctx, ruleName, childs)
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

    return
  } else if ('formule' in rule.rawNode) {
    // Try to replace internal refs if possible.
    const childs = ctx.refs.childs.get(ruleName)
    if (childs?.length > 0) {
      replaceAllPossibleChildRefs(ctx, childs)
    }
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
  console.time('copy')
  const parsedRules: ParsedRules<RuleName> =
    // PERF: could it be avoided?
    JSON.parse(JSON.stringify(engine.getParsedRules()))
  console.timeEnd('copy')

  console.time('initFoldingCtx')
  let ctx: FoldingCtx = {
    engine,
    parsedRules,
    toKeep,
    refs: getRefs(parsedRules),
    params: params?.isFoldedAttr ? params : { isFoldedAttr: 'optimized' },
  }
  console.timeEnd('initFoldingCtx')

  for (const [ruleName, ruleNode] of Object.entries(ctx.parsedRules)) {
    if (isFoldable(ruleNode) && !isAlreadyFolded(ctx.params, ruleNode)) {
      tryToFoldRule(ctx, ruleName, ruleNode)
    }
  }

  if (toKeep) {
    ctx.parsedRules = Object.fromEntries(
      Object.entries(ctx.parsedRules).filter(([ruleName, ruleNode]) => {
        const parents = ctx.refs.parents.get(ruleName)
        return (
          !isFoldable(ruleNode, ctx.impactedByContexteRules) ||
          toKeep([ruleName, ruleNode]) ||
          parents?.length > 0
        )
      }),
    )
  }

  return ctx.parsedRules
}
