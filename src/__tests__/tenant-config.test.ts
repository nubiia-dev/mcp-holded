import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadTenantConfigs } from '../utils/tenant-config.js';

describe('loadTenantConfigs v2 keys', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Neutralize any ambient config from the developer's shell
    vi.stubEnv('HOLDED_API_KEY', '');
    vi.stubEnv('HOLDED_API_KEY_V2', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('picks up HOLDED_API_KEY_V2 in single-tenant mode', () => {
    vi.stubEnv('HOLDED_API_KEY', 'v1-key');
    vi.stubEnv('HOLDED_API_KEY_V2', 'sk_live_abc');

    const configs = loadTenantConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].apiKey).toBe('v1-key');
    expect(configs[0].apiKeyV2).toBe('sk_live_abc');
  });

  it('leaves apiKeyV2 undefined when the env var is absent', () => {
    vi.stubEnv('HOLDED_API_KEY', 'v1-key');

    const configs = loadTenantConfigs();
    expect(configs[0].apiKeyV2).toBeUndefined();
  });

  it('picks up TENANT_N_API_KEY_V2 in multi-tenant mode', () => {
    vi.stubEnv('TENANT_1_NAME', 'Acme');
    vi.stubEnv('TENANT_1_API_KEY', 'k1');
    vi.stubEnv('TENANT_1_API_KEY_V2', 'sk_live_1');
    vi.stubEnv('TENANT_2_NAME', 'Beta');
    vi.stubEnv('TENANT_2_API_KEY', 'k2');

    const configs = loadTenantConfigs();
    const acme = configs.find((c) => c.name === 'Acme');
    const beta = configs.find((c) => c.name === 'Beta');
    expect(acme?.apiKeyV2).toBe('sk_live_1');
    expect(beta?.apiKeyV2).toBeUndefined();
  });
});
