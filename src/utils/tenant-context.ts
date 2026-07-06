import { HoldedClient } from '../holded-client.js';

/**
 * Tenant configuration interface
 */
export interface TenantConfig {
  id: string;
  name: string;
  apiKey: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Tenant context for a request
 */
export interface TenantContext {
  tenantId: string;
  client: HoldedClient;
  config: TenantConfig;
}

/**
 * Multi-tenancy manager that handles multiple Holded organizations/tenants
 * Each tenant has its own API key and HoldedClient instance
 */
export class TenantManager {
  private tenants: Map<string, TenantContext> = new Map();
  private defaultTenantId: string | null = null;

  /**
   * Register a new tenant
   */
  registerTenant(config: TenantConfig): void {
    if (this.tenants.has(config.id)) {
      throw new Error(`Tenant '${config.id}' is already registered`);
    }

    const client = new HoldedClient(config.apiKey);
    const context: TenantContext = {
      tenantId: config.id,
      client,
      config,
    };

    this.tenants.set(config.id, context);

    // First registered tenant becomes default
    if (this.defaultTenantId === null) {
      this.defaultTenantId = config.id;
    }
  }

  /**
   * Get tenant context by ID
   */
  getTenant(tenantId: string): TenantContext | null {
    return this.tenants.get(tenantId) || null;
  }

  /**
   * Get default tenant context
   */
  getDefaultTenant(): TenantContext | null {
    if (this.defaultTenantId === null) {
      return null;
    }
    return this.getTenant(this.defaultTenantId);
  }

  /**
   * Set default tenant
   */
  setDefaultTenant(tenantId: string): void {
    if (!this.tenants.has(tenantId)) {
      throw new Error(`Tenant '${tenantId}' not found`);
    }
    this.defaultTenantId = tenantId;
  }

  /**
   * List all registered tenant IDs
   */
  listTenants(): string[] {
    return Array.from(this.tenants.keys());
  }

  /**
   * Check if a tenant is enabled
   */
  isTenantEnabled(tenantId: string): boolean {
    const tenant = this.getTenant(tenantId);
    return tenant !== null && tenant.config.enabled;
  }

  /**
   * Remove a tenant
   */
  removeTenant(tenantId: string): void {
    this.tenants.delete(tenantId);
    if (this.defaultTenantId === tenantId) {
      // Set new default to first available tenant
      const firstTenant = this.tenants.keys().next();
      this.defaultTenantId = firstTenant.done ? null : firstTenant.value;
    }
  }

  /**
   * Get tenant count
   */
  getTenantCount(): number {
    return this.tenants.size;
  }
}

/**
 * Extract tenant ID from arguments if present
 * Supports both direct tenantId field and nested in metadata
 */
export function extractTenantId(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }

  const obj = args as Record<string, unknown>;

  // Direct tenantId field
  if (typeof obj.tenantId === 'string' && obj.tenantId.length > 0) {
    return obj.tenantId;
  }

  // Nested in metadata
  if (typeof obj.metadata === 'object' && obj.metadata !== null) {
    const metadata = obj.metadata as Record<string, unknown>;
    if (typeof metadata.tenantId === 'string' && metadata.tenantId.length > 0) {
      return metadata.tenantId;
    }
  }

  return null;
}
