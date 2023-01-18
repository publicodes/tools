/*
	The [compile] command definition.

    An optimization pass is performed (for now, a constant folding)
    on the ruleset before writing it to the JSON file.
*/

import { ArgumentsCamelCase, Argv } from "yargs";
import { constantFoldingFromJSONFile } from "..";

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
  const { model, json: jsonPath, ignore } = argv;
  const error = constantFoldingFromJSONFile(
    model,
    jsonPath,
    ignore,
    undefined,
    true
  );
  if (error) {
    console.error(error);
    process.exit(1);
  }
};
