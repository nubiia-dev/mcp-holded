import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadTenantConfigs } from '../utils/tenant-config.js';

describe('loadTenantConfigs', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Neutralize any ambient config from the developer's shell
    vi.stubEnv('HOLDED_API_KEY', '');
    vi.stubEnv('HOLDED_API_KEY_V2', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('single-tenant mode', () => {
    it('picks up HOLDED_API_KEY_V2 as the primary key', () => {
      vi.stubEnv('HOLDED_API_KEY_V2', 'pat_abc');

      const configs = loadTenantConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].apiKey).toBe('pat_abc');
    });

    it('falls back to HOLDED_API_KEY when _V2 is absent', () => {
      vi.stubEnv('HOLDED_API_KEY', 'sk_live_fallback');

      const configs = loadTenantConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].apiKey).toBe('sk_live_fallback');
    });

    it('prefers HOLDED_API_KEY_V2 over HOLDED_API_KEY when both are set', () => {
      vi.stubEnv('HOLDED_API_KEY', 'old-key');
      vi.stubEnv('HOLDED_API_KEY_V2', 'pat_new');

      const configs = loadTenantConfigs();
      expect(configs[0].apiKey).toBe('pat_new');
    });

    it('returns empty array when no key is configured', () => {
      const configs = loadTenantConfigs();
      expect(configs).toHaveLength(0);
    });

    it('does not expose an apiKeyV2 field on TenantConfig', () => {
      vi.stubEnv('HOLDED_API_KEY_V2', 'pat_abc');

      const configs = loadTenantConfigs();
      expect(configs[0]).not.toHaveProperty('apiKeyV2');
    });
  });

  describe('multi-tenant mode', () => {
    it('picks up TENANT_N_API_KEY_V2 as primary key per tenant', () => {
      vi.stubEnv('TENANT_1_NAME', 'Acme');
      vi.stubEnv('TENANT_1_API_KEY_V2', 'pat_1');
      vi.stubEnv('TENANT_2_NAME', 'Beta');
      vi.stubEnv('TENANT_2_API_KEY', 'sk_live_2');

      const configs = loadTenantConfigs();
      const acme = configs.find((c) => c.name === 'Acme');
      const beta = configs.find((c) => c.name === 'Beta');
      expect(acme?.apiKey).toBe('pat_1');
      expect(beta?.apiKey).toBe('sk_live_2');
    });

    it('prefers TENANT_N_API_KEY_V2 over TENANT_N_API_KEY when both set', () => {
      vi.stubEnv('TENANT_1_NAME', 'Acme');
      vi.stubEnv('TENANT_1_API_KEY', 'old-key');
      vi.stubEnv('TENANT_1_API_KEY_V2', 'pat_new');

      const configs = loadTenantConfigs();
      expect(configs[0].apiKey).toBe('pat_new');
    });
  });
});
