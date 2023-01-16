/*
	The [compile] command definition.

    An optimization pass is performed (for now, a constant folding)
    on the ruleset before writing it to the JSON file.
*/

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import type { ArgumentsCamelCase, Argv } from "yargs";
import { disabledLogger, getRawNodes, readRawRules } from "../commons";
import Engine from "publicodes";
import constantFolding from "../constantFolding";

type Options = {
  model: string;
  json: string;
  markdown: boolean;
  ignore?: string[];
};

exports.command = "compile <model> <json>";
exports.describe = "Compiles a Publicodes model into the specified JSON file.";

exports.builder = (yargs: Argv) => {
  return yargs
    .option("ignore", {
      alias: "i",
      describe: "Regexp matching files to ignore from the model tree.",
      default: "**/translated-*.yaml",
      type: "string",
      array: true,
    })
    .option("markdown", {
      alias: "m",
      describe: "Generate a markdown output.",
      type: "boolean",
    })
    .positional("model", {
      type: "string",
      describe:
        "Path to the folder containing the Publicodes files or to a JSON file (the extension must be '.json' then).",
      normalize: true,
    })
    .positional("json", {
      type: "string",
      describe: "Path to the JSON file target.",
      normalize: true,
    });
};

exports.handler = (argv: ArgumentsCamelCase<Options>) => {
  try {
    const { model, json: jsonPath, ignore } = argv;
    var rules: any;

    if (path.extname(model) === ".json") {
      console.log("Parsing rules from the JSON file:", model);
      rules = JSON.parse(readFileSync(model, "utf8"));
    } else {
      const modelPath = path.join(path.resolve(model), "**/*.yaml");
      console.log(`Parsing rules from ${modelPath}...`);
      rules = readRawRules(modelPath, ignore ?? []);
    }

    const engine = new Engine(rules, { logger: disabledLogger });

    console.log("Constant folding pass...");
    const foldedRules = constantFolding(engine);

    console.log(`Writing in '${jsonPath}'...`);
    writeFileSync(jsonPath, JSON.stringify(getRawNodes(foldedRules)));

    console.log(`DONE.`);
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(-1);
  }
};
