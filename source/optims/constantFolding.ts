import Engine, { reduceAST } from "publicodes";

import type { EvaluatedNode, RuleNode, ASTNode, Unit } from "publicodes";
import type { RuleName, ParsedRules } from "../commons";

type RefMap = Map<
  RuleName,
  // NOTE: It's an array but it's built from a Set, so no duplication
  RuleName[] | undefined
>;

type RefMaps = {
  parents: RefMap;
  childs: RefMap;
};

type PredicateOnRule = (rule: [RuleName, RuleNode]) => boolean;

type FoldingParams = {
  // The attribute name to use to mark a rule as folded, default to 'optimized'.
  isFoldedAttr?: string;
};

type FoldingCtx = {
  engine: Engine;
  parsedRules: ParsedRules;
  refs: RefMaps;
  evaluatedRules: Map<RuleName, EvaluatedNode>;
  toKeep?: PredicateOnRule;
  params: FoldingParams;
};

function addMapEntry(map: RefMap, key: RuleName, values: RuleName[]) {
  let vals = map.get(key);
  if (vals) {
    vals = vals.concat(values);
  }
  map.set(key, vals || values);
}

function initFoldingCtx(
  engine: Engine,
  parsedRules: ParsedRules,
  toKeep?: PredicateOnRule,
  foldingParams?: FoldingParams
): FoldingCtx {
  const refs: RefMaps = { parents: new Map(), childs: new Map() };
  const evaluatedRules: Map<RuleName, EvaluatedNode> = new Map();

  Object.entries(parsedRules).forEach(([ruleName, ruleNode]) => {
    const evaluatedRule = engine.evaluate(ruleName);
    evaluatedRules.set(ruleName, evaluatedRule);
    const traversedVariables: RuleName[] = Array.from(
      reduceAST(
        (acc: Set<RuleName>, node: ASTNode) => {
          if (
            node.nodeKind === "reference" &&
            "dottedName" in node &&
            node.dottedName !== ruleName
          ) {
            return acc.add(node.dottedName);
          }
        },
        new Set(),
        ruleNode.explanation.valeur
      ) ?? new Set()
    );

    if (traversedVariables.length > 0) {
      addMapEntry(refs.childs, ruleName, traversedVariables);
      traversedVariables.forEach((traversedVar) => {
        addMapEntry(refs.parents, traversedVar, [ruleName]);
      });
    }
  });

  return {
    engine,
    parsedRules,
    refs,
    evaluatedRules,
    toKeep,
    params: { isFoldedAttr: foldingParams?.isFoldedAttr ?? "optimized" },
  };
}

function isFoldable(rule: RuleNode): boolean {
  if (!rule) {
    return false;
  }
  const rawNode = rule.rawNode;
  return !(
    "question" in rawNode ||
    // NOTE(@EmileRolley): I assume that a rule can have a [par défaut] attribute without a [question] one.
    // The behavior could be specified.
    "par défaut" in rawNode ||
    "applicable si" in rawNode ||
    "non applicable si" in rawNode
  );
}

function isInParsedRules(parsedRules: ParsedRules, rule: RuleName): boolean {
  return Object.keys(parsedRules).includes(rule);
}

function isEmptyRule(rule: RuleNode): boolean {
  // There is always a 'nom' attribute.
  return Object.keys(rule.rawNode).length <= 1;
}

function formatPublicodesUnit(unit?: Unit): string {
  if (
    unit !== undefined &&
    unit.numerators.length === 1 &&
    unit.numerators[0] === "%"
  ) {
    return "%";
  }
  return "";
}

// Replaces boolean values by their string representation in French.
function formatToPulicodesValue(value: any, unit?: Unit) {
  if (typeof value === "boolean") {
    return value ? "oui" : "non";
  }

  return value + formatPublicodesUnit(unit);
}

function replaceAllRefs(
  str: string,
  refName: string,
  constantValue: any
): string {
  // NOTE(@EmileRolley): temporary fix of the previous \b which can't handle
  // all unicode characters. But the lookbehind feature is not supported by all browsers.
  // A better solution would be to use the parseExpression function from publicodes,
  // see: https://github.com/betagouv/publicodes/pull/368
  const re = new RegExp(`(?<=^|\\s|\\()${refName}`, "g");
  return str.replaceAll(re, constantValue);
}

function lexicalSubstitutionOfRefValue(
  parent: RuleNode,
  constant: RuleNode
): RuleNode | undefined {
  const refName = reduceAST<string>(
    (_, node: ASTNode) => {
      if (
        node.nodeKind === "reference" &&
        node.dottedName === constant.dottedName
      ) {
        return node.name;
      }
    },
    "",
    parent
  );

  const constValue = formatToPulicodesValue(constant.rawNode.valeur);

  if ("formule" in parent.rawNode) {
    if (typeof parent.rawNode.formule === "string") {
      parent.rawNode.formule = replaceAllRefs(
        parent.rawNode.formule,
        refName,
        constValue
      );
      return parent;
    } else if ("somme" in parent.rawNode.formule) {
      // TODO: needs to be abstracted
      parent.rawNode.formule.somme = (
        parent.rawNode.formule.somme as (string | number)[]
      ).map((expr: string | number) => {
        return typeof expr === "string"
          ? replaceAllRefs(expr, refName, constValue)
          : expr;
      });
      return parent;
    }
  }
  // When a rule defined as an unique string: 'var * var2', it's parsed as a [valeur] attribute not a [formule].
  if (typeof parent.rawNode.valeur === "string") {
    parent.rawNode.formule = replaceAllRefs(
      parent.rawNode.valeur,
      refName,
      constValue
    );
    delete parent.rawNode.valeur;
    return parent;
  }
}

// Replaces all references in [refs] (could be childs or parents) of [ruleName]
// by its [rule.valeur].
function searchAndReplaceConstantValueInParentRefs(
  ctx: FoldingCtx,
  ruleName: RuleName,
  rule: RuleNode
): FoldingCtx {
  const refs = ctx.refs.parents.get(ruleName);
  const parentsToRemove: RuleName[] = [];

  if (refs) {
    refs
      .map((dottedName) => ctx.parsedRules[dottedName])
      .filter(isFoldable)
      .forEach(({ dottedName: parentDottedName }) => {
        const newRule = lexicalSubstitutionOfRefValue(
          ctx.parsedRules[parentDottedName],
          rule
        );
        if (newRule) {
          ctx.parsedRules[parentDottedName] = newRule;
          ctx.parsedRules[parentDottedName].rawNode[ctx.params.isFoldedAttr] =
            true;
          parentsToRemove.push(parentDottedName);
        }
      });

    ctx.refs.parents.set(
      ruleName,
      refs.filter((name) => !parentsToRemove.includes(name))
    );
  }

  return ctx;
}

function isAlreadyFolded(params: FoldingParams, rule: RuleNode): boolean {
  return "rawNode" in rule && params.isFoldedAttr in rule.rawNode;
}

function isAConstant(rule: RuleNode) {
  return "valeur" in rule.rawNode && !("formule" in rule.rawNode);
}

// Subsitutes [parentRuleNode.formule] ref constant from [refs].
//
// NOTE: It folds child rules in [refs] if possible.
function replaceAllPossibleChildRefs(
  ctx: FoldingCtx,
  parentRuleName: RuleName,
  parentRuleNode: RuleNode,
  refs: RuleName[]
): FoldingCtx {
  if (refs) {
    refs
      .map((dottedName) => ctx.parsedRules[dottedName])
      .filter(isFoldable)
      .forEach(({ dottedName: childDottedName }) => {
        let childNode = ctx.parsedRules[childDottedName];

        if (!childNode) {
          // TODO: need to investigate
          return;
        }

        if (!isAlreadyFolded(ctx.params, childNode)) {
          ctx = tryToFoldRule(ctx, childDottedName, childNode);
        }
        if (isAConstant(childNode)) {
          const newRule = lexicalSubstitutionOfRefValue(
            parentRuleNode,
            childNode
          );
          if (newRule !== undefined) {
            ctx.parsedRules[parentRuleName] = newRule;
            ctx.parsedRules[parentRuleName].rawNode[ctx.params.isFoldedAttr] =
              true;
            ctx = updateRefCounting(ctx, parentRuleName, [childDottedName]);
          }
        }
      });
  }
  return ctx;
}

function removeRuleFromRefs(ref: RefMap, ruleName: RuleName) {
  Array.from(ref.keys()).forEach((rule: RuleName) => {
    const refs = ref.get(rule);
    if (refs !== undefined) {
      ref.set(
        rule,
        refs.filter((r) => r !== ruleName)
      );
    }
  });
}

function deleteRule(ctx: FoldingCtx, dottedName: RuleName): FoldingCtx {
  const ruleNode = ctx.parsedRules[dottedName];
  if (
    (ctx.toKeep === undefined || !ctx.toKeep([dottedName, ruleNode])) &&
    isFoldable(ruleNode)
  ) {
    removeRuleFromRefs(ctx.refs.parents, dottedName);
    removeRuleFromRefs(ctx.refs.childs, dottedName);
    delete ctx.parsedRules[dottedName];
    delete ctx.evaluatedRules[dottedName];
    ctx.refs.parents.delete(dottedName);
    ctx.refs.childs.delete(dottedName);
  }
  return ctx;
}

// Removes the [parentRuleName] as a parent dependency of each [childRuleNamesToUpdate].
function updateRefCounting(
  ctx: FoldingCtx,
  parentRuleName: RuleName,
  childRuleNamesToUpdate: RuleName[]
): FoldingCtx {
  childRuleNamesToUpdate.forEach((childRuleDottedName: RuleName) => {
    ctx.refs.parents.set(
      childRuleDottedName,
      ctx.refs.parents
        .get(childRuleDottedName)
        ?.filter(
          (dottedName) =>
            isInParsedRules(ctx.parsedRules, dottedName) &&
            dottedName !== parentRuleName
        )
    );
    if (ctx.refs.parents.get(childRuleDottedName)?.length === 0) {
      ctx = deleteRule(ctx, childRuleDottedName);
    }
  });
  return ctx;
}

function tryToFoldRule(
  ctx: FoldingCtx,
  ruleName: RuleName,
  rule: RuleNode
): FoldingCtx {
  if (
    rule !== undefined &&
    (isAlreadyFolded(ctx.params, rule) ||
      !isInParsedRules(ctx.parsedRules, ruleName))
  ) {
    // Already managed rule
    return ctx;
  }

  const ruleParents = ctx.refs.parents.get(ruleName);
  if (
    isEmptyRule(rule) &&
    (ruleParents === undefined || ruleParents?.length === 0)
  ) {
    // Empty rule with no parent
    deleteRule(ctx, ruleName);
    return ctx;
  }

  const { nodeValue, missingVariables, traversedVariables, unit } =
    ctx.evaluatedRules.get(ruleName) ?? ctx.engine.evaluateNode(rule);

  const traversedVariablesWithoutSelf = traversedVariables.filter(
    (dottedName) => dottedName !== ruleName
  );

  // NOTE(@EmileRolley): we need to evaluate due to possible standalone rule [formule]
  // parsed as a [valeur].
  if ("valeur" in rule.rawNode && traversedVariablesWithoutSelf?.length > 0) {
    rule.rawNode.formule = rule.rawNode.valeur;
    delete rule.rawNode.valeur;
  }

  const missingVariablesNames = Object.keys(missingVariables);

  // Constant leaf -> search and replace the constant in all its parents.
  if (
    "valeur" in rule.rawNode ||
    ("formule" in rule.rawNode && missingVariablesNames.length === 0)
  ) {
    if ("formule" in rule.rawNode) {
      ctx.parsedRules[ruleName].rawNode.valeur = formatToPulicodesValue(
        nodeValue,
        unit
      );
    }

    ctx = searchAndReplaceConstantValueInParentRefs(ctx, ruleName, rule);

    if ("formule" in rule.rawNode) {
      // The rule do not depends on any other rule anymore, so we need to remove
      // it from the [refs].
      const childs = ctx.refs.childs.get(ruleName) ?? [];

      ctx = updateRefCounting(
        ctx,
        ruleName,
        // NOTE(@EmileRolley): for some reason, the [traversedVariables] are not always
        // depencies of the rule. Consequently, we need to keep only the ones that are
        // in the [childs] list in order to avoid removing rules that are not dependencies.
        traversedVariablesWithoutSelf?.filter((v: RuleName) =>
          childs.includes(v)
        ) ?? []
      );
      delete ctx.parsedRules[ruleName].rawNode.formule;
    }

    if (ruleParents?.length === 0) {
      // NOTE(@EmileRolley): temporary work around until all mechanisms are supported.
      // Indeed, when replacing a leaf ref by its value in all its parents,
      // it should always be removed.
      deleteRule(ctx, ruleName);
    } else {
      ctx.parsedRules[ruleName].rawNode[ctx.params.isFoldedAttr] = true;
    }

    return ctx;
  }

  // Try to replace internal refs if possible.
  if ("formule" in rule.rawNode) {
    const childs = ctx.refs.childs.get(ruleName);

    if (childs?.length > 0) {
      replaceAllPossibleChildRefs(ctx, ruleName, rule, childs);
    }
  }
  return ctx;
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
  params?: FoldingParams
): ParsedRules {
  const parsedRules: ParsedRules = engine.getParsedRules();
  let ctx: FoldingCtx = initFoldingCtx(engine, parsedRules, toKeep, params);

  Object.entries(ctx.parsedRules).forEach(([ruleName, ruleNode]) => {
    if (isFoldable(ruleNode) && !isAlreadyFolded(ctx.params, ruleNode)) {
      ctx = tryToFoldRule(ctx, ruleName, ruleNode);
    }
  });

  if (toKeep) {
    ctx.parsedRules = Object.fromEntries(
      Object.entries(ctx.parsedRules).filter(([ruleName, ruleNode]) => {
        const parents = ctx.refs.parents.get(ruleName);
        return (
          !isFoldable(ruleNode) ||
          toKeep([ruleName, ruleNode]) ||
          parents?.length > 0
        );
      })
    );
  }

  return ctx.parsedRules;
}
