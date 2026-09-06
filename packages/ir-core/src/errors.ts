/**
 * Erreurs et avertissements de l'IR (spec §12).
 *
 * Aucune fonction du projet ne lève de chaîne : tout diagnostic est une
 * valeur `IRError` avec un code, le chemin du nœud, une position optionnelle
 * et un message qui dit quoi faire.
 */

export const ERROR_CODES = [
  "E001",
  "E002",
  "E003",
  "E004",
  "E005",
  "E006",
  "E007",
  "E008",
  "E009",
] as const;

export const WARNING_CODES = ["W001", "W002", "W003"] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type WarningCode = (typeof WARNING_CODES)[number];
export type DiagnosticCode = ErrorCode | WarningCode;

export type Severity = "error" | "warning";

/** Étape qui peut émettre le diagnostic (colonne « Où » de la spec §12). */
export type Stage = "parse" | "import" | "typecheck" | "layout" | "normalize";

export interface DiagnosticSpec {
  readonly severity: Severity;
  /** Message de la table §12, sans le contexte du nœud. */
  readonly summary: string;
  readonly stages: readonly Stage[];
}

/** Table de la spec §12, un seul endroit où les codes sont décrits. */
export const DIAGNOSTICS: Readonly<Record<DiagnosticCode, DiagnosticSpec>> = {
  E001: {
    severity: "error",
    summary: "Valeur littérale là où un token est requis",
    stages: ["parse", "import"],
  },
  E002: {
    severity: "error",
    summary: "Token inconnu dans le design system",
    stages: ["typecheck"],
  },
  E003: {
    severity: "error",
    summary: "Construction non représentable dans l'IR",
    stages: ["import"],
  },
  E004: {
    severity: "error",
    summary: "Propriété invalide pour ce type de nœud",
    stages: ["parse"],
  },
  E005: {
    severity: "error",
    summary: "Identifiant dupliqué",
    stages: ["parse"],
  },
  E006: {
    severity: "error",
    summary: "Image sans dimension résolvable",
    stages: ["typecheck"],
  },
  E007: {
    severity: "error",
    summary:
      "`fill` sous une contrainte infinie (Stack `scroll` sur le même axe, ou racine sans viewport)",
    stages: ["layout"],
  },
  E008: {
    severity: "error",
    summary: "Frames de breakpoints structurellement différentes",
    stages: ["import"],
  },
  E009: {
    severity: "error",
    summary:
      "Erreur de syntaxe (lexème inattendu, fin de fichier prématurée, type de nœud inconnu)",
    stages: ["parse"],
  },
  W001: {
    severity: "warning",
    summary: "`fill` dans un parent `hug`, normalisé en `hug`",
    stages: ["normalize"],
  },
  W002: {
    severity: "warning",
    summary: "Valeur arrondie au token le plus proche (mode tolérant)",
    stages: ["import"],
  },
  W003: {
    severity: "warning",
    summary: "Surcharge sans effet, supprimée",
    stages: ["normalize"],
  },
};

/** Position dans un fichier `.ir`. Ligne et colonne comptent à partir de 1. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface IRError {
  readonly code: DiagnosticCode;
  /** Chemin du nœud, identifiants séparés par `/` : `root/form/email`. */
  readonly path: string;
  /** Présente seulement si la source est un fichier `.ir`. */
  readonly position?: Position;
  /** Contient toujours une phrase qui dit quoi faire. */
  readonly message: string;
}

/**
 * Résultat d'une opération qui peut échouer. Une opération n'échoue jamais
 * par exception : elle rend `ok: false` avec au moins un diagnostic.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly IRError[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(errors: readonly IRError[]): Result<T> {
  return { ok: false, errors };
}

export function severityOf(code: DiagnosticCode): Severity {
  return DIAGNOSTICS[code].severity;
}

export function isErrorCode(code: DiagnosticCode): code is ErrorCode {
  return DIAGNOSTICS[code].severity === "error";
}

/**
 * Construit un diagnostic. `position` n'est ajoutée que si elle est fournie,
 * pour que l'objet ne porte jamais de clé à `undefined`.
 */
export function irError(
  code: DiagnosticCode,
  path: string,
  message: string,
  position?: Position,
): IRError {
  return position === undefined
    ? { code, path, message }
    : { code, path, position, message };
}
