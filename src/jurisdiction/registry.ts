/**
 * @classytic/payroll - Jurisdiction Registry
 *
 * Pluggable jurisdiction system. Register custom jurisdictions at runtime.
 */

import type { JurisdictionDefinition, JurisdictionIdentifier } from './types.js';

// ============================================================================
// Registry
// ============================================================================

class JurisdictionRegistry {
  private jurisdictions = new Map<string, JurisdictionDefinition>();

  /**
   * Register a jurisdiction
   */
  register(jurisdiction: JurisdictionDefinition): void {
    const key = this.makeKey(jurisdiction);

    // Validate jurisdiction
    this.validate(jurisdiction);

    this.jurisdictions.set(key, jurisdiction);
  }

  /**
   * Register multiple jurisdictions
   */
  registerMany(jurisdictions: JurisdictionDefinition[]): void {
    for (const jurisdiction of jurisdictions) {
      this.register(jurisdiction);
    }
  }

  /**
   * Get jurisdiction by identifier
   */
  get(identifier: JurisdictionIdentifier): JurisdictionDefinition | undefined {
    const key = this.makeKeyFromIdentifier(identifier);
    return this.jurisdictions.get(key);
  }

  /**
   * Get jurisdiction with fallback to parent
   */
  getWithFallback(identifier: JurisdictionIdentifier): JurisdictionDefinition | undefined {
    // Try exact match first
    let jurisdiction = this.get(identifier);
    if (jurisdiction) return jurisdiction;

    // Fall back to state level (if city was specified)
    if (identifier.city) {
      jurisdiction = this.get({
        country: identifier.country,
        state: identifier.state,
      });
      if (jurisdiction) return jurisdiction;
    }

    // Fall back to country level
    if (identifier.state || identifier.city) {
      jurisdiction = this.get({
        country: identifier.country,
      });
      if (jurisdiction) return jurisdiction;
    }

    return undefined;
  }

  /**
   * Check if jurisdiction is registered
   */
  has(identifier: JurisdictionIdentifier): boolean {
    return this.get(identifier) !== undefined;
  }

  /**
   * Get all jurisdictions for a country
   */
  getByCountry(countryCode: string): JurisdictionDefinition[] {
    const results: JurisdictionDefinition[] = [];

    for (const jurisdiction of this.jurisdictions.values()) {
      const key = this.makeKey(jurisdiction);
      if (key.startsWith(`${countryCode}:`)) {
        results.push(jurisdiction);
      }
    }

    return results;
  }

  /**
   * Get all registered jurisdictions
   */
  getAll(): JurisdictionDefinition[] {
    return Array.from(this.jurisdictions.values());
  }

  /**
   * Remove a jurisdiction
   */
  unregister(identifier: JurisdictionIdentifier): boolean {
    const key = this.makeKeyFromIdentifier(identifier);
    return this.jurisdictions.delete(key);
  }

  /**
   * Clear all jurisdictions
   */
  clear(): void {
    this.jurisdictions.clear();
  }

  /**
   * Get registry size
   */
  size(): number {
    return this.jurisdictions.size;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private makeKey(jurisdiction: JurisdictionDefinition): string {
    return this.makeKeyFromId(jurisdiction.id);
  }

  private makeKeyFromId(id: string): string {
    return id.toUpperCase();
  }

  private makeKeyFromIdentifier(identifier: JurisdictionIdentifier): string {
    const parts = [identifier.country.toUpperCase()];

    if (identifier.state) {
      parts.push(identifier.state.toUpperCase());
    }

    if (identifier.city) {
      parts.push(identifier.city.toUpperCase());
    }

    if (identifier.custom) {
      parts.push(identifier.custom.toUpperCase());
    }

    return parts.join(':');
  }

  private validate(jurisdiction: JurisdictionDefinition): void {
    if (!jurisdiction.id) {
      throw new Error('Jurisdiction must have an id');
    }

    if (!jurisdiction.name) {
      throw new Error('Jurisdiction must have a name');
    }

    if (!jurisdiction.currency) {
      throw new Error('Jurisdiction must have a currency');
    }

    if (!jurisdiction.tax) {
      throw new Error('Jurisdiction must have tax configuration');
    }

    if (!jurisdiction.tax.incomeTax || !Array.isArray(jurisdiction.tax.incomeTax)) {
      throw new Error('Jurisdiction must have income tax brackets');
    }

    if (!jurisdiction.overtime) {
      throw new Error('Jurisdiction must have overtime configuration');
    }

    if (!jurisdiction.leave) {
      throw new Error('Jurisdiction must have leave entitlements');
    }

    if (!jurisdiction.wage) {
      throw new Error('Jurisdiction must have wage configuration');
    }

    if (!jurisdiction.workingHours) {
      throw new Error('Jurisdiction must have working hours configuration');
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const jurisdictionRegistry = new JurisdictionRegistry();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register a jurisdiction
 */
export function registerJurisdiction(jurisdiction: JurisdictionDefinition): void {
  jurisdictionRegistry.register(jurisdiction);
}

/**
 * Register multiple jurisdictions
 */
export function registerJurisdictions(jurisdictions: JurisdictionDefinition[]): void {
  jurisdictionRegistry.registerMany(jurisdictions);
}

/**
 * Get jurisdiction
 */
export function getJurisdiction(identifier: JurisdictionIdentifier): JurisdictionDefinition | undefined {
  return jurisdictionRegistry.getWithFallback(identifier);
}

/**
 * Get jurisdiction (throws if not found)
 */
export function requireJurisdiction(identifier: JurisdictionIdentifier): JurisdictionDefinition {
  const jurisdiction = getJurisdiction(identifier);

  if (!jurisdiction) {
    const key = jurisdictionRegistry['makeKeyFromIdentifier'](identifier);
    throw new Error(`Jurisdiction not found: ${key}`);
  }

  return jurisdiction;
}

/**
 * Check if jurisdiction exists
 */
export function hasJurisdiction(identifier: JurisdictionIdentifier): boolean {
  return jurisdictionRegistry.has(identifier);
}

/**
 * Get all jurisdictions for a country
 */
export function getJurisdictionsByCountry(countryCode: string): JurisdictionDefinition[] {
  return jurisdictionRegistry.getByCountry(countryCode);
}
