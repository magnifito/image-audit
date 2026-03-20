export interface Config {
  projectRoot: string;
  srcDir: string;
  assetsDir: string;
  srcDirAbsolute: string;
  assetsDirAbsolute: string;
  sourceExtensions: string[];
  imageExtensions: string[];
  imagePathPatterns: RegExp[];
  pathAliases: Record<string, string>;
  overuseThreshold: number;
  reporter: 'text' | 'json';
  noColor: boolean;
  verbose: boolean;
}

export interface ImageReference {
  sourceFile: string;
  imagePath: string;
  originalPath: string;
  lineNumber: number;
}

export interface ScanResult {
  references: ImageReference[];
  warnings: string[];
}

export interface AuditResult<T = unknown> {
  ok: boolean;
  issues: T[];
}

export interface BrokenIssue {
  sourceFile: string;
  imagePath: string;
  resolved: string;
  lineNumber: number;
}

export interface UnusedIssue {
  imagePath: string;
}

export interface DuplicateIssue {
  hash: string;
  files: string[];
}

export interface CompatIssue {
  imagePath: string;
  type: 'mismatch' | 'error' | 'unknown_binary';
  declaredExt: string;
  detectedExt: string | null;
  detectedMime: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  fileSize: number;
  errorMessage: string | null;
}

export interface CompatEntry {
  imagePath: string;
  declaredExt: string;
  detectedExt: string | null;
  detectedMime: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  fileSize: number;
  status: 'ok' | 'ok_equivalent' | 'mismatch' | 'unknown_binary' | 'error';
  errorMessage: string | null;
}

export interface OveruseIssue {
  imagePath: string;
  originalPath: string;
  usages: Array<{ sourceFile: string; lineNumber: number }>;
}

export interface CompatAuditResult extends AuditResult<CompatIssue> {
  entries: CompatEntry[];
  stats: { audited: number };
}

export function loadConfig(cliOptions?: Partial<Config>): Promise<Config>;
export function scanReferences(config: Config): ScanResult;
export function findFiles(
  startPath: string,
  extensions: string[],
  options?: { recursive?: boolean }
): string[];
export function normalizePath(
  rawPath: string,
  sourceFileRelative: string,
  config: Config
): { normalized: string | null; warning: string | null };
export function auditBroken(config: Config, scanResult: ScanResult): AuditResult<BrokenIssue>;
export function auditUnused(config: Config, scanResult: ScanResult): AuditResult<UnusedIssue>;
export function auditDuplicates(config: Config): AuditResult<DuplicateIssue>;
export function auditCompat(config: Config): Promise<CompatAuditResult>;
export function auditOveruse(config: Config, scanResult: ScanResult): AuditResult<OveruseIssue>;

export interface LintOptions extends Partial<Config> {
  audits?: Array<'broken' | 'unused' | 'dupes' | 'compat' | 'overuse'>;
}

export interface LintResult {
  ok: boolean;
  results: {
    broken?: AuditResult<BrokenIssue>;
    unused?: AuditResult<UnusedIssue>;
    dupes?: AuditResult<DuplicateIssue>;
    compat?: CompatAuditResult;
    overuse?: AuditResult<OveruseIssue>;
  };
  warnings: string[];
}

export function lint(options?: LintOptions): Promise<LintResult>;

export interface ImageInspection {
  ext: string;
  mime: string;
  valid: boolean;
  format: string;
  hasNamespace?: boolean;
  hasViewBox?: boolean;
  hasDimensions?: boolean;
}

export function inspectImage(filePath: string): ImageInspection | null;
export const WEB_IMAGE_EXTS: Set<string>;
