import {
  Rule,
  ParsedRules,
  Logger,
  ExprAST,
  RuleNode,
  reduceAST,
  ASTNode,
} from 'publicodes'

/**
 * @packageDocumentation
 *
 * This file contains all the common types and functions used by
 * the publicodes tools.
 *
 *
 * @requires publicodes
 */

/**
 * Represents a rule name, i.e. 'rule . A. B'
 */
export type RuleName = string

/**
 * Represents a non-parsed NGC rule.
 */
export type RawRule = Omit<Rule, 'nom'>

/**
 * Represents a non-parsed NGC model.
 */
export type RawRules = Record<RuleName, RawRule>

/**
 * Returns the raw nodes of a parsed rules object.
 *
 * @param parsedRules - The parsed rules object.
 *
 * @returns The raw nodes of the parsed rules object.
 */
export function getRawNodes(parsedRules: ParsedRules<RuleName>): RawRules {
  return Object.fromEntries(
    Object.values(parsedRules).reduce((acc, rule) => {
      const { nom, ...rawNode } = rule.rawNode
      acc.push([nom, rawNode])
      return acc
    }, []),
  ) as RawRules
}

function consumeMsg(_: string): void {}

export const disabledLogger: Logger = {
  log: consumeMsg,
  warn: consumeMsg,
  error: consumeMsg,
}

/**
 * Returns the list of all the references in a rule node.
 *
 * @param node - The rule node to explore.
 *
 * @returns The references.
 */
export function getAllRefsInNode(node: RuleNode): RuleName[] {
  return reduceAST<RuleName[]>(
    (refs: RuleName[], node: ASTNode) => {
      if (node === undefined) {
        return refs
      }
      if (node.nodeKind === 'reference' && !refs.includes(node.dottedName)) {
        refs.push(node.dottedName)
      }
    },
    [],
    node,
  )
}

const binaryOps = ['+', '-', '*', '/', '>', '<', '>=', '<=', '=', '!=']

/**
 * Map a parsed expression into another parsed expression.
 *
 * @param parsedExpr The parsed expression in a JSON format.
 * @param fn The function to apply to each node of the parsed expression.
 *
 * @returns The parsed expression with the function applied to each node.
 */
export function mapParsedExprAST(
  parsedExpr: ExprAST,
  fn: (node: ExprAST) => ExprAST,
): ExprAST {
  if ('variable' in parsedExpr || 'constant' in parsedExpr) {
    return fn(parsedExpr)
  }
  if (binaryOps.some((op) => op in parsedExpr)) {
    for (const key of Object.keys(parsedExpr)) {
      // @ts-ignore
      // FIXME: needs to export BinaryOp from publicodes
      return fn({
        [key]: [
          mapParsedExprAST(parsedExpr[key][0], fn),
          mapParsedExprAST(parsedExpr[key][1], fn),
        ],
      })
    }
  }
  return parsedExpr
}

/**
 * Serialize a parsed expression into its string representation.
 *
 * @param parsedExpr The parsed expression in a JSON format.
 * @param needsParens Whether the expression needs to be wrapped in parentheses.
 *
 * @returns The string representation of the parsed expression.
 *
 * @note Could be clever and remove unnecessary parentheses, for example:
 * 		 `(A + B) + C` -> `A + B + C`
 *
 * @example
 * ```
 * serializeParsedExprAST(
 *   { '+': [{ variable: "A" }, { constant: { type: "number", nodeValue: "10" } }] },
 *   true
 * )
 * // "(A + 10)"
 * ```
 */
export function serializeParsedExprAST(
  parsedExpr: ExprAST,
  needsParens = false,
): string {
  if ('variable' in parsedExpr) {
    return parsedExpr.variable
  }
  if ('constant' in parsedExpr) {
    return (
      parsedExpr.constant.nodeValue +
      ('unité' in parsedExpr ? parsedExpr.unité : '')
    )
  }
  if (binaryOps.some((op) => op in parsedExpr)) {
    for (const key of Object.keys(parsedExpr)) {
      return (
        (needsParens ? '(' : '') +
        `${serializeParsedExprAST(
          parsedExpr[key][0],
          true,
        )} ${key} ${serializeParsedExprAST(parsedExpr[key][1], true)}` +
        (needsParens ? ')' : '')
      )
    }
  }
}

/**
 * Replace all occurences [variableName] node with the corresponding [constValue] node.
 *
 * @param parsedExpr The parsed expression in a JSON format.
 * @param variableName The name of the variable to replace.
 * @param constValue The value to replace the variable with.
 *
 * @returns The parsed expression with all occurences of [VariableNode] with
 * the corresponding [ConstantNode].
 *
 * @example
 * ```
 * substituteIn(
 *  { variable: "A" },
 *  "A",
 *  "10",
 *  "ruleA"
 *  )
 *  // { constant: { type: "number", nodeValue: "10" } }
 *  ```
 */
export function substituteInParsedExpr(
  parsedExpr: ExprAST,
  variableName: RuleName,
  constValue: string,
): ExprAST {
  const { type, nodeValue } = !isNaN(Number(constValue))
    ? { type: 'number', nodeValue: Number.parseFloat(constValue) }
    : { type: 'string', nodeValue: constValue }

  // @ts-ignore
  // FIXME: I don't know why this is not working
  return mapParsedExprAST(parsedExpr, (node: ExprAST) => {
    if ('variable' in node && node?.variable === variableName) {
      return { constant: { type, nodeValue } }
    }
    return node
  })
}
