import { readFileSync, writeFileSync } from "fs";
import path from "path";
import Engine from "publicodes";
import { disabledLogger, getRawNodes, readRawRules, RuleName } from "./commons";
import constantFolding from "./constantFolding";

/**
 * Applies a constant folding optimization pass to the parsed rules from the [model] path.
 *
 * @param model Path to the folder containing the Publicodes files or to a JSON file (the extension must be '.json' then).
 * @param json Path to the JSON file target.
 * @param ignore Regexp matching files to ignore from the model tree.
 * @param targets List of rules to target for the optimization pass.
 * @param verbose Whether to log the optimization pass.
 *
 * @returns An error message if the optimization pass failed, undefined otherwise.
 */
export function constantFoldingFromJSONFile(
  model: string,
  jsonDestPath: string,
  ignore?: string[],
  targets?: RuleName[],
  verbose = false
): Error | undefined {
  const log = verbose ? console.log : function (_: any) {};
  try {
    var rules: any;

    if (path.extname(model) === ".json") {
      log("Parsing rules from the JSON file:", model);
      rules = JSON.parse(readFileSync(model, "utf8"));
    } else {
      const modelPath = path.join(path.resolve(model), "**/*.yaml");
      log(`Parsing rules from ${modelPath}...`);
      rules = readRawRules(modelPath, ignore ?? []);
    }

    const engine = new Engine(rules, { logger: disabledLogger });

    log("Constant folding pass...");
    const foldedRules = constantFolding(engine, targets);

    log(`Writing in '${jsonDestPath}'...`);
    writeFileSync(jsonDestPath, JSON.stringify(getRawNodes(foldedRules)));
  } catch (error) {
    return error;
  }
}
