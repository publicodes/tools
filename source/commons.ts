import type { Rule, ParsedRules, Logger } from "publicodes";

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
export type RuleName = string;

/**
 * Represents a non-parsed NGC model.
 */
export type RawRules = Record<RuleName, Omit<Rule, "nom">>;

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
      const { nom, ...rawNode } = rule.rawNode;
      acc.push([nom, rawNode]);
      return acc;
    }, [])
  ) as RawRules
}

function consumeMsg(_: string): void {}

export const disabledLogger: Logger = {
  log: consumeMsg,
  warn: consumeMsg,
  error: consumeMsg,
}

export type ConstantNode<T extends string> = {
  constant: {
    type: T
    nodeValue: string
  }
  unité?: string
}

export type VariableNode = {
  variable: RuleName
}

export type BinaryOp =
  | { '+': [ParsedExprAST, ParsedExprAST] }
  | { '-': [ParsedExprAST, ParsedExprAST] }
  | { '*': [ParsedExprAST, ParsedExprAST] }
  | { '/': [ParsedExprAST, ParsedExprAST] }
  | { '>': [ParsedExprAST, ParsedExprAST] }
  | { '<': [ParsedExprAST, ParsedExprAST] }
  | { '>=': [ParsedExprAST, ParsedExprAST] }
  | { '<=': [ParsedExprAST, ParsedExprAST] }
  | { '=': [ParsedExprAST, ParsedExprAST] }
  | { '!=': [ParsedExprAST, ParsedExprAST] }

export type ParsedExprAST =
  | BinaryOp
  | ConstantNode<'number' | 'string' | 'boolean'>
  | VariableNode

