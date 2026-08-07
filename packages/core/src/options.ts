/** The value types a plugin option may declare. */
export type OptionType = "string" | "number" | "boolean";

/**
 * A named argument contributed by a plugin. Plugins may only contribute named
 * arguments -- positionals are reserved for the input file names and glob
 * patterns handed to the reporter.
 */
export interface OptionSpec {
  /** Long name, without the leading `--`. Use kebab-case. */
  readonly name: string;
  readonly type: OptionType;
  /** One-line description shown in `orion help generate`. */
  readonly description: string;
  /** When true the command fails if the option is absent. */
  readonly required?: boolean;
  /** When true the option may be repeated and is collected into an array. */
  readonly multiple?: boolean;
  /** Applied when the option is absent. Mutually exclusive with `required`. */
  readonly default?: string | number | boolean;
}

/** A resolved option value, after coercion to the declared type. */
export type OptionValue = string | number | boolean | readonly string[] | readonly number[];

/** Raw option values handed to a plugin's parse phase, keyed by `OptionSpec.name`. */
export type OptionValues = Readonly<Record<string, OptionValue | undefined>>;

/**
 * One problem found while parsing options. Plugins report these rather than
 * throwing, so a host can show every problem at once and attribute each to the
 * flag that caused it.
 */
export interface OptionIssue {
  /**
   * Bare `OptionSpec.name` this issue is about, when it is about a single
   * option. Omit for a problem spanning several -- a host prefixes the name
   * with the plugin's role to name the flag the user actually typed.
   */
  readonly option?: string;
  /**
   * What is wrong and what to do about it, written for the person who typed
   * the flag. Phrase it to read after the flag name, e.g. "is required".
   */
  readonly message: string;
}

/**
 * The outcome of a plugin's parse phase: either the options that plugin will
 * work with, or every problem found. Hosts other than the CLI -- the viewer
 * above all -- build plugin options the same way, which is why this lives here
 * rather than in `@orion/cli`.
 */
export type OptionsResult<TOptions> =
  | { readonly ok: true; readonly options: TOptions }
  | { readonly ok: false; readonly issues: readonly OptionIssue[] };
