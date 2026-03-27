import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Element } from '../../model/element.js';
import type { Diagnostic, DiagnosticSeverity } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';

const PASS_NAME = 'user_rules';

/** Match filter for selecting which elements a rule applies to */
interface RuleMatch {
  category?: string;
  tag?: string;
  status?: string;
  scope?: string;
}

/** Requirement check — what must be true for matching elements */
interface RuleRequire {
  min_tags?: number;
  has_field?: string;
  maps_to_category?: string;
}

/** A user-defined validation rule */
interface UserRule {
  name?: string;
  match?: RuleMatch;
  require?: RuleRequire;
  severity?: 'error' | 'warning';
}

let ruleCounter = 0;

/**
 * User-defined validation rules (VAL-6, DEC-5.2, DEC-5.10).
 * User diagnostic codes use U prefix (DEC-5.10).
 */
export function userRulesPass(catalog: Catalog, config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const rules = (config.validation_rules ?? []) as UserRule[];

  ruleCounter = 0;

  for (const rule of rules) {
    ruleCounter++;
    const code = `U${String(ruleCounter).padStart(3, '0')}`;
    const ruleName = rule.name ?? `rule_${ruleCounter}`;
    const severity: DiagnosticSeverity = rule.severity ?? 'warning';

    if (!rule.require) continue;

    for (const element of catalog.getAllElements()) {
      if (!matchesFilter(element, rule.match, catalog)) continue;

      // Check min_tags
      if (rule.require.min_tags !== undefined) {
        if (element.tags.length < rule.require.min_tags) {
          diagnostics.push(createDiagnostic(
            code,
            `USER_RULE_${ruleName.toUpperCase()}`,
            `Element ${element.toLibraryId()} has ${element.tags.length} tag(s), minimum required: ${rule.require.min_tags} (rule: ${ruleName})`,
            severity,
            PASS_NAME,
            { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
          ));
        }
      }

      // Check has_field
      if (rule.require.has_field !== undefined) {
        const fieldValue = element.get(rule.require.has_field);
        if (fieldValue === undefined || fieldValue === null) {
          diagnostics.push(createDiagnostic(
            code,
            `USER_RULE_${ruleName.toUpperCase()}`,
            `Element ${element.toLibraryId()} is missing required field '${rule.require.has_field}' (rule: ${ruleName})`,
            severity,
            PASS_NAME,
            {
              elementId: element.id,
              documentPath: element.documentPath,
              categoryName: element.categoryName,
              fieldName: rule.require.has_field,
            },
          ));
        }
      }

      // Check maps_to_category
      if (rule.require.maps_to_category !== undefined) {
        const requiredCat = rule.require.maps_to_category;
        const mapsToTarget = element.maps_to.some(ref => {
          const target = catalog.getAllElements().find(
            e => e.toLibraryId() === ref || e.hashKey() === ref,
          );
          return target?.categoryName === requiredCat;
        });

        if (!mapsToTarget && element.maps_to.length > 0) {
          diagnostics.push(createDiagnostic(
            code,
            `USER_RULE_${ruleName.toUpperCase()}`,
            `Element ${element.toLibraryId()} does not map to any '${requiredCat}' element (rule: ${ruleName})`,
            severity,
            PASS_NAME,
            { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
          ));
        }
      }
    }
  }

  return diagnostics;
}

/** Check if an element matches a rule's filter criteria */
function matchesFilter(element: Element, match: RuleMatch | undefined, catalog: Catalog): boolean {
  if (!match) return true; // No filter = matches all

  if (match.category && element.categoryName !== match.category) return false;
  if (match.tag && !element.tags.includes(match.tag)) return false;
  if (match.status && element.status !== match.status) return false;
  if (match.scope) {
    const doc = catalog.documents.find(d => d.documentPath === element.documentPath);
    if (doc?.meta.scope !== match.scope) return false;
  }

  return true;
}
