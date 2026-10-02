export { isPulumiDiff } from "./guard.js";
export {
  isSecretValue,
  isTruncatedValue,
  isUnknownValue,
  PULUMI_DIFF_KIND,
  PULUMI_DIFF_VERSION,
  RESOURCE_OPS,
  SECRET,
  UNKNOWN,
} from "./schema.js";
export type {
  Diagnostic,
  DiffTotals,
  PropertyChange,
  PropertyChangeKind,
  PropertyValue,
  PulumiDiffData,
  ResourceChange,
  ResourceOp,
  Truncated,
} from "./schema.js";
