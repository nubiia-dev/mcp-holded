import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getContactTools } from '../tools/contacts.js';

describe('Contact Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getContactTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getContactTools(client);
  });

  describe('list_contacts', () => {
    it('should list contacts with no args via v2', async () => {
      await tools.list_contacts.handler({});
    });

    it('should pass limit to API', async () => {
      await tools.list_contacts.handler({ limit: 10 });
    });

    it('should pass cursor to API', async () => {
      await tools.list_contacts.handler({ cursor: 'page:2' });
    });

    it('should pass limit and cursor together', async () => {
      await tools.list_contacts.handler({ limit: 20, cursor: 'page:3' });
    });

    it('should normalize v2 envelope with nextCursor and hasMore', async () => {
      const mockItems = [
        { id: 'c1', name: 'Alice' },
        { id: 'c2', name: 'Bob' },
      ];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_contacts.handler({})) as any;
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support fields filtering preserving nextCursor and hasMore', async () => {
      const mockItems = [{ id: 'c1', name: 'Alice', email: 'alice@example.com' }];
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_contacts.handler({ fields: ['id', 'name'] })) as any;
      expect(result.items[0]).toEqual({ id: 'c1', name: 'Alice' });
      expect(result.items[0]).not.toHaveProperty('email');
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
    });

    it('should support summary mode', async () => {
      const mockItems = Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        name: `Contact ${i}`,
      }));
      client.get = vi
        .fn()
        .mockResolvedValue({ items: mockItems, cursor: 'page:2', has_more: true });
      const result = (await tools.list_contacts.handler({ summary: true })) as any;
      expect(result.count).toBe(5);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('create_contact', () => {
    it('should create a contact with required fields (v2)', async () => {
      await tools.create_contact.handler({ name: 'Test Contact' });
    });

    it('should include optional fields including code (NIF/CIF/VAT)', async () => {
      const args = {
        name: 'Test Contact',
        email: 'test@example.com',
        phone: '+34600000000',
        code: 'B12345678',
        type: 'client' as const,
      };
      await tools.create_contact.handler(args);
    });

    it('should use code field for NIF/CIF/VAT (not vatnumber)', async () => {
      const args = { name: 'Empresa SL', code: 'B98765432' };
      await tools.create_contact.handler(args);
      const callArgs = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('vatnumber');
      expect(callArgs).toHaveProperty('code', 'B98765432');
    });

    it('should include billing address', async () => {
      const args = {
        name: 'Test Contact',
        billAddress: {
          address: 'Calle Test 123',
          city: 'Madrid',
          postalCode: '28001',
          country: 'ES',
        },
      };
      await tools.create_contact.handler(args);
    });

    it('should include contactPersons when provided', async () => {
      const args = {
        name: 'Empresa SL',
        contactPersons: [
          { name: 'Ana García', phone: '+34600000001', email: 'ana@empresa.com' },
          { name: 'Luis Pérez' },
        ],
      };
      await tools.create_contact.handler(args);
    });

    it('should reject contactPersons entries missing required name', async () => {
      await expect(
        tools.create_contact.handler({
          name: 'Empresa SL',
          contactPersons: [{ phone: '+34600000001' } as any],
        })
      ).rejects.toThrow();
    });

    it('should reject invalid email format in contactPersons', async () => {
      await expect(
        tools.create_contact.handler({
          name: 'Empresa SL',
          contactPersons: [{ name: 'Ana García', email: 'not-a-valid-email' }],
        })
      ).rejects.toThrow();
    });

    it('should accept valid email format in contactPersons', async () => {
      const args = {
        name: 'Empresa SL',
        contactPersons: [{ name: 'Ana García', email: 'ana@empresa.com' }],
      };
      await tools.create_contact.handler(args);
    });

    it('contactPersons email field should have format: email in inputSchema', () => {
      const contactPersonsItems = (tools.create_contact.inputSchema.properties as any)
        .contactPersons.items;
      expect(contactPersonsItems.properties.email.format).toBe('email');
    });

    it('should create contact without contactPersons (field is optional)', async () => {
      const args = { name: 'Solo Contact', email: 'solo@example.com' };
      await tools.create_contact.handler(args);
    });
  });

  describe('get_contact', () => {
    it('should get a contact by ID (v2)', async () => {
      await tools.get_contact.handler({ contactId: 'contact-123' });
    });
  });

  describe('update_contact', () => {
    it('should update a contact (v2)', async () => {
      const args = {
        contactId: 'contact-123',
        name: 'Updated Name',
        email: 'updated@example.com',
      };
      await tools.update_contact.handler(args);
      expect(client.put).toHaveBeenCalledWith('/contacts/contact-123', {
        name: 'Updated Name',
        email: 'updated@example.com',
      });
    });

    it('should update the code field (NIF/CIF/VAT) correctly', async () => {
      await tools.update_contact.handler({ contactId: 'contact-123', code: 'A12345678' });
      expect(client.put).toHaveBeenCalledWith('/contacts/contact-123', { code: 'A12345678' });
    });

    it('should update contactPersons', async () => {
      const args = {
        contactId: 'contact-123',
        contactPersons: [{ name: 'Maria López', email: 'maria@empresa.com' }],
      };
      await tools.update_contact.handler(args);
      expect(client.put).toHaveBeenCalledWith('/contacts/contact-123', {
        contactPersons: [{ name: 'Maria López', email: 'maria@empresa.com' }],
      });
    });
  });

  describe('delete_contact', () => {
    it('should delete a contact (v2)', async () => {
      await tools.delete_contact.handler({ contactId: 'contact-123' });
    });
  });

  describe('list_contact_attachments', () => {
    it('should list contact attachments (v2)', async () => {
      await tools.list_contact_attachments.handler({ contactId: 'contact-123' });
      expect(client.get).toHaveBeenCalledWith('/contacts/contact-123/attachments', undefined);
    });
  });

  describe('get_contact_attachment', () => {
    it('should get a specific attachment by filename (v2 breaking change)', async () => {
      await tools.get_contact_attachment.handler({
        contactId: 'contact-123',
        filename: 'invoice.pdf',
      });
      expect(client.get).toHaveBeenCalledWith(
        '/contacts/contact-123/attachments/invoice.pdf',
        undefined
      );
    });
  });
});
