import { TenantConfig } from './tenant-context.js';

/**
 * Load tenant configurations from environment variables
 *
 * Supports two modes:
 *
 * 1. Single tenant (legacy mode):
 *    - HOLDED_API_KEY=xxx
 *
 * 2. Multi-tenant mode:
 *    - TENANT_1_NAME=Acme Corp
 *    - TENANT_1_API_KEY=xxx
 *    - TENANT_1_ENABLED=true
 *    - TENANT_2_NAME=Beta Inc
 *    - TENANT_2_API_KEY=yyy
 *    - TENANT_2_ENABLED=true
 *
 * The loader will automatically detect which mode to use based on available env vars.
 */
export function loadTenantConfigs(): TenantConfig[] {
  const configs: TenantConfig[] = [];

  // Check for multi-tenant configuration
  const tenantPattern = /^TENANT_(\d+)_NAME$/;
  const tenantIds = new Set<string>();

  for (const key of Object.keys(process.env)) {
    const match = key.match(tenantPattern);
    if (match) {
      tenantIds.add(match[1]);
    }
  }

  if (tenantIds.size > 0) {
    // Multi-tenant mode
    for (const id of tenantIds) {
      const name = process.env[`TENANT_${id}_NAME`];
      const apiKey = process.env[`TENANT_${id}_API_KEY`];
      const enabledStr = process.env[`TENANT_${id}_ENABLED`];
      const apiKeyV2 = process.env[`TENANT_${id}_API_KEY_V2`] || undefined;

      if (!name || !apiKey) {
        console.error(
          `Warning: Tenant ${id} has incomplete configuration (missing name or API key)`
        );
        continue;
      }

      const enabled = enabledStr !== 'false'; // Default to true if not specified

      configs.push({
        id: `tenant_${id}`,
        name,
        apiKey,
        apiKeyV2,
        enabled,
        metadata: {
          source: 'environment',
          envPrefix: `TENANT_${id}`,
        },
      });
    }

    console.error(`Loaded ${configs.length} tenant(s) from environment variables`);
    return configs;
  }

  // Single tenant mode (legacy)
  const apiKey = process.env.HOLDED_API_KEY;
  if (apiKey) {
    const apiKeyV2 = process.env.HOLDED_API_KEY_V2 || undefined;
    configs.push({
      id: 'default',
      name: 'Default Organization',
      apiKey,
      apiKeyV2,
      enabled: true,
      metadata: {
        source: 'environment',
        legacy: true,
      },
    });

    console.error('Running in single-tenant mode (legacy)');
    return configs;
  }

  // No configuration found
  return configs;
}

/**
 * Validate that at least one tenant configuration is available
 */
export function validateTenantConfigs(configs: TenantConfig[]): void {
  if (configs.length === 0) {
    throw new Error(
      'No tenant configuration found. Please set either:\n' +
        '  - HOLDED_API_KEY for single-tenant mode, or\n' +
        '  - TENANT_1_NAME and TENANT_1_API_KEY for multi-tenant mode'
    );
  }

  const enabledCount = configs.filter((c) => c.enabled).length;
  if (enabledCount === 0) {
    throw new Error('No enabled tenants found. At least one tenant must be enabled.');
  }

  console.error(`Configuration valid: ${configs.length} tenant(s), ${enabledCount} enabled`);
}
