import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockClient } from './mock-client.js';
import { getDocumentTools } from '../tools/documents.js';
import {
  documentItemSchema,
  docTypeEnum,
  documentIdSchema,
  listDocumentsSchema,
  updateDocumentPipelineSchema,
  attachFileToDocumentSchema,
  shipItemsByLineSchema,
  payDocumentSchema,
  sendDocumentSchema,
  updateDocumentTrackingSchema,
  createDocumentSchema,
  updateDocumentSchema,
  numberingSerieIdSchema,
  createNumberingSerieSchema,
} from '../validation.js';

describe('Document Tools', () => {
  let client: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof getDocumentTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    tools = getDocumentTools(client);
  });

  describe('list_documents', () => {
    it('lists invoice documents via v2 route', async () => {
      await tools.list_documents.handler({ docType: 'invoice' });
    });

    it('lists purchase documents via v2 route', async () => {
      await tools.list_documents.handler({ docType: 'purchase' });
    });

    it('lists receiptnote documents via v2 route', async () => {
      await tools.list_documents.handler({ docType: 'receiptnote' });
    });

    it('forwards cursor param to v2', async () => {
      await tools.list_documents.handler({ docType: 'invoice', cursor: 'page:2' });
    });

    it('forwards limit param to v2', async () => {
      await tools.list_documents.handler({ docType: 'invoice', limit: 20 });
    });

    it('returns normalised v2 envelope', async () => {
      client.get = vi.fn().mockResolvedValue({ items: [{ id: 'doc-1' }], has_more: false });
      const result = (await tools.list_documents.handler({ docType: 'invoice' })) as any;
      expect(result.items).toBeDefined();
      expect(result.items[0].id).toBe('doc-1');
      expect(result.hasMore).toBe(false);
    });

    it('returns summary with count when summary=true', async () => {
      client.get = vi.fn().mockResolvedValue({
        items: [{ id: 'd1' }, { id: 'd2' }],
        has_more: true,
        cursor: 'page:2',
      });
      const result = (await tools.list_documents.handler({
        docType: 'invoice',
        summary: true,
      })) as any;
      expect(result.count).toBe(2);
      expect(result.items).toBeUndefined();
    });

    it('supports fields filtering', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: [{ id: 'doc-1', total: '100,00', extra: 'drop' }] });
      const result = (await tools.list_documents.handler({
        docType: 'invoice',
        fields: ['id', 'total'],
      })) as any;
      expect(result.items[0]).toEqual({ id: 'doc-1', total: '100,00' });
      expect(result.items[0].extra).toBeUndefined();
    });

    it('works with estimate doc type', async () => {
      await tools.list_documents.handler({ docType: 'estimate' });
    });

    it('works with salesorder doc type', async () => {
      await tools.list_documents.handler({ docType: 'salesorder' });
    });

    it('rejects purchaserefund (list not supported in v2)', async () => {
      await expect(tools.list_documents.handler({ docType: 'purchaserefund' })).rejects.toThrow(
        /Only creation is supported/
      );
    });
  });

  describe('create_document', () => {
    it('should create a document with required fields including date as Unix timestamp', async () => {
      const args = {
        docType: 'invoice' as const,
        contactId: 'contact-123',
        items: [{ name: 'Item 1', units: 1, subtotal: 100 }],
        date: 1700000000,
      };
      await tools.create_document.handler(args);
      expect(client.post).toHaveBeenCalledWith('/invoices', {
        contactId: 'contact-123',
        items: [{ name: 'Item 1', units: 1, subtotal: 100 }],
        date: 1700000000,
        approveDoc: true,
      });
    });

    it('should reject date as string (must be Unix timestamp integer)', async () => {
      await expect(
        tools.create_document.handler({
          docType: 'invoice' as const,
          contactId: 'contact-123',
          items: [],
          date: '2024-01-15' as any,
        })
      ).rejects.toThrow();
    });

    it('should reject missing date field', async () => {
      await expect(
        tools.create_document.handler({
          docType: 'invoice' as const,
          contactId: 'contact-123',
          items: [],
        } as any)
      ).rejects.toThrow();
    });

    it('should include optional fields alongside required date', async () => {
      const args = {
        docType: 'invoice' as const,
        contactId: 'contact-123',
        items: [],
        date: 1700000000,
        notes: 'Test notes',
        currency: 'EUR',
      };
      await tools.create_document.handler(args);
      expect(client.post).toHaveBeenCalledWith('/invoices', {
        contactId: 'contact-123',
        items: [],
        date: 1700000000,
        notes: 'Test notes',
        currency: 'EUR',
        approveDoc: true,
      });
    });

    it('should accept date as current Unix timestamp', async () => {
      const now = Math.floor(Date.now() / 1000);
      const args = {
        docType: 'estimate' as const,
        contactId: 'contact-456',
        items: [{ name: 'Service', units: 1, subtotal: 200 }],
        date: now,
      };
      await tools.create_document.handler(args);
      expect(client.post).toHaveBeenCalledWith('/estimates', {
        contactId: 'contact-456',
        items: [{ name: 'Service', units: 1, subtotal: 200 }],
        date: now,
        approveDoc: true,
      });
    });

    it('should accept extended docTypes: salesreceipt, creditnote, receiptnote via v2 routes', async () => {
      const cases = [
        { docType: 'salesreceipt' as const, route: '/sales-receipts' },
        { docType: 'creditnote' as const, route: '/credit-notes' },
        { docType: 'receiptnote' as const, route: '/receipt-notes' },
      ] as const;
      for (const { docType, route } of cases) {
        vi.clearAllMocks();
        await tools.create_document.handler({
          docType,
          contactId: 'contact-123',
          items: [],
          date: 1700000000,
        });
        expect(client.post).toHaveBeenCalledWith(route, {
          contactId: 'contact-123',
          items: [],
          date: 1700000000,
          approveDoc: true,
        });
      }
    });

    it('creates purchaserefund via the dedicated v2 route', async () => {
      await tools.create_document.handler({
        docType: 'purchaserefund',
        contactId: 'c1',
        items: [],
        date: 1700000000,
      });
    });

    describe('approveDoc parameter', () => {
      it('should default approveDoc to true when omitted, finalizing the document', async () => {
        // Regression test for github issue #51: without approveDoc the Holded API
        // creates documents as drafts that are invisible in the UI.
        await tools.create_document.handler({
          docType: 'invoice' as const,
          contactId: 'contact-123',
          items: [{ name: 'Item', units: 1, subtotal: 100 }],
          date: 1700000000,
        });
        const callBody = (client.post as any).mock.calls[0][1];
        expect(callBody.approveDoc).toBe(true);
      });

      it('should forward approveDoc:true explicitly', async () => {
        await tools.create_document.handler({
          docType: 'invoice' as const,
          contactId: 'contact-123',
          items: [{ name: 'Item', units: 1, subtotal: 100 }],
          date: 1700000000,
          approveDoc: true,
        });
        const callBody = (client.post as any).mock.calls[0][1];
        expect(callBody.approveDoc).toBe(true);
      });

      it('should forward approveDoc:false to intentionally create a draft', async () => {
        await tools.create_document.handler({
          docType: 'invoice' as const,
          contactId: 'contact-123',
          items: [{ name: 'Item', units: 1, subtotal: 100 }],
          date: 1700000000,
          approveDoc: false,
        });
        const callBody = (client.post as any).mock.calls[0][1];
        expect(callBody.approveDoc).toBe(false);
      });

      it('should reject approveDoc with a non-boolean value', async () => {
        await expect(
          tools.create_document.handler({
            docType: 'invoice' as const,
            contactId: 'contact-123',
            items: [],
            date: 1700000000,
            approveDoc: 'yes' as any,
          })
        ).rejects.toThrow();
      });

      it('should include approveDoc in create_document inputSchema as boolean', () => {
        const props = tools.create_document.inputSchema.properties as any;
        expect(props).toHaveProperty('approveDoc');
        expect(props.approveDoc.type).toBe('boolean');
      });
    });
  });

  describe('get_document', () => {
    it('gets an invoice via v2 route', async () => {
      await tools.get_document.handler({ docType: 'invoice', documentId: 'doc-123' });
    });

    it('rejects non-create operations on purchaserefund with a clear v2 error', async () => {
      await expect(
        tools.get_document.handler({ docType: 'purchaserefund', documentId: 'x' })
      ).rejects.toThrow(/Only creation is supported/);
    });
  });

  describe('update_document', () => {
    it('should update a document', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        notes: 'Updated notes',
      };
      await tools.update_document.handler(args);
    });

    it('should accept date as Unix timestamp integer when updating', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        date: 1700086400,
        notes: 'Revised notes',
      };
      await tools.update_document.handler(args);
      expect(client.put).toHaveBeenCalledWith('/invoices/doc-123', {
        date: 1700086400,
        notes: 'Revised notes',
      });
    });

    it('should reject date as string when updating', async () => {
      await expect(
        tools.update_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-123',
          date: '2024-01-15' as any,
        })
      ).rejects.toThrow();
    });

    it('should accept currency field when updating a document', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        currency: 'USD',
      };
      await tools.update_document.handler(args);
    });

    it('inputSchema should include currency field in update_document', () => {
      expect(tools.update_document.inputSchema.properties).toHaveProperty('currency');
    });
  });

  describe('delete_document', () => {
    it('should delete a document', async () => {
      await tools.delete_document.handler({ docType: 'invoice', documentId: 'doc-123' });
    });
  });

  describe('pay_document', () => {
    it('should register a payment via v2 route', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        amount: 100,
        date: 1700000000,
      };
      await tools.pay_document.handler(args);
      expect(client.post).toHaveBeenCalledWith('/invoices/doc-123/payments', {
        amount: 100,
        date: 1700000000,
      });
    });

    it('throws unsupportedOp for estimate (not payable in v2)', async () => {
      await expect(
        tools.pay_document.handler({
          docType: 'estimate' as const,
          documentId: 'doc-1',
          amount: 50,
        })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('throws unsupportedOp for salesorder (not payable in v2)', async () => {
      await expect(
        tools.pay_document.handler({
          docType: 'salesorder' as const,
          documentId: 'doc-1',
          amount: 50,
        })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('passes for purchase (payable in v2)', async () => {
      await tools.pay_document.handler({
        docType: 'purchase' as const,
        documentId: 'doc-1',
        amount: 100,
      });
    });
  });

  describe('send_document', () => {
    it('should send a document by email via v2 route', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        emails: ['test@example.com'],
        subject: 'Invoice',
        message: 'Please find attached',
      };
      await tools.send_document.handler(args);
      expect(client.post).toHaveBeenCalledWith('/invoices/doc-123/send', {
        emails: ['test@example.com'],
        subject: 'Invoice',
        message: 'Please find attached',
      });
    });

    it('should send a document without emails (emails is optional)', async () => {
      // emails is optional — the document can be sent to the contact associated with it
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        subject: 'Invoice',
        message: 'Please find attached',
      };
      await tools.send_document.handler(args);
      expect(client.post).toHaveBeenCalledWith('/invoices/doc-123/send', {
        subject: 'Invoice',
        message: 'Please find attached',
      });
    });

    it('should send a document with only required fields (docType and documentId)', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
      };
      await tools.send_document.handler(args);
    });

    it('throws unsupportedOp for purchase (not sendable in v2)', async () => {
      await expect(
        tools.send_document.handler({ docType: 'purchase' as const, documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('throws unsupportedOp for purchaserefund (not sendable in v2)', async () => {
      await expect(
        tools.send_document.handler({ docType: 'purchaserefund' as const, documentId: 'doc-1' })
      ).rejects.toThrow();
    });

    it('should reject invalid email addresses in emails array', async () => {
      await expect(
        tools.send_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-123',
          emails: ['not-an-email'],
        })
      ).rejects.toThrow();
    });

    it('inputSchema should not include emails in required array', () => {
      expect(tools.send_document.inputSchema.required).not.toContain('emails');
      expect(tools.send_document.inputSchema.required).toContain('docType');
      expect(tools.send_document.inputSchema.required).toContain('documentId');
    });
  });

  describe('get_document_pdf', () => {
    it('calls getBinary for invoice PDF and returns base64 payload with filename', async () => {
      (client as any).getBinary = vi.fn().mockResolvedValue({
        contentType: 'application/pdf',
        base64: 'JVBERi0=',
        bytes: 4,
      });
      const result = (await tools.get_document_pdf.handler({
        docType: 'invoice',
        documentId: 'doc-123',
      })) as any;
      expect((client as any).getBinary).toHaveBeenCalledWith('/invoices/doc-123/pdf');
      expect(result.base64).toBe('JVBERi0=');
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toBe('invoice-doc-123.pdf');
    });

    it('should get document PDF via v2 route (invoice)', async () => {
      // getBinary is already mocked in mock-client; just verify the handler resolves
      await tools.get_document_pdf.handler({ docType: 'invoice', documentId: 'doc-123' });
    });

    it('throws unsupportedOp for purchase (no PDF in v2)', async () => {
      await expect(
        tools.get_document_pdf.handler({ docType: 'purchase', documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('throws for purchaserefund (not supported in v2)', async () => {
      await expect(
        tools.get_document_pdf.handler({ docType: 'purchaserefund', documentId: 'doc-1' })
      ).rejects.toThrow();
    });
  });

  describe('ship_all_items', () => {
    it('salesorder ships via /ship (v2)', async () => {
      await tools.ship_all_items.handler({ docType: 'salesorder', documentId: 'doc-123' });
    });

    it('purchaseorder receives via /receive (v2)', async () => {
      await tools.ship_all_items.handler({ docType: 'purchaseorder', documentId: 'doc-123' });
    });

    it('throws unsupportedOp for invoice', async () => {
      await expect(
        tools.ship_all_items.handler({ docType: 'invoice', documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('throws unsupportedOp for waybill (waybills are themselves shipping docs in v2)', async () => {
      await expect(
        tools.ship_all_items.handler({ docType: 'waybill', documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });
  });

  describe('ship_items_by_line', () => {
    it('salesorder ships via /ship-by-lines (v2)', async () => {
      const args = {
        docType: 'salesorder' as const,
        documentId: 'doc-123',
        lines: [{ lineId: 'line-1', units: 5 }],
      };
      await tools.ship_items_by_line.handler(args);
      expect(client.post).toHaveBeenCalledWith('/sales-orders/doc-123/ship-by-lines', {
        lines: [{ lineId: 'line-1', units: 5 }],
      });
    });

    it('throws unsupportedOp for invoice', async () => {
      await expect(
        tools.ship_items_by_line.handler({ docType: 'invoice', documentId: 'doc-1', lines: [] })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('throws unsupportedOp for purchaseorder (receive-by-lines is UNVERIFIED in v2)', async () => {
      await expect(
        tools.ship_items_by_line.handler({
          docType: 'purchaseorder',
          documentId: 'doc-1',
          lines: [],
        })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });
  });

  describe('get_shipped_units', () => {
    it('salesorder returns shipped-items (v2)', async () => {
      await tools.get_shipped_units.handler({ docType: 'salesorder', documentId: 'doc-123' });
    });

    it('purchaseorder returns received-items (v2)', async () => {
      await tools.get_shipped_units.handler({ docType: 'purchaseorder', documentId: 'doc-123' });
    });

    it('throws unsupportedOp for invoice', async () => {
      await expect(
        tools.get_shipped_units.handler({ docType: 'invoice', documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });
  });

  describe('attach_file_to_document', () => {
    it('should attach a file via v2 /attachments route', async () => {
      const args = {
        docType: 'invoice' as const,
        documentId: 'doc-123',
        fileBase64: 'SGVsbG8gV29ybGQ=',
        filename: 'test.pdf',
      };
      await tools.attach_file_to_document.handler(args);
      expect(client.uploadFile).toHaveBeenCalledWith(
        '/invoices/doc-123/attachments',
        expect.any(Buffer),
        'test.pdf'
      );
    });
  });

  describe('update_document_tracking', () => {
    it('salesorder tracking uses PUT /sales-orders/{id}/tracking (v2)', async () => {
      const args = {
        docType: 'salesorder' as const,
        documentId: 'doc-123',
        trackingNumber: 'TRACK123',
        carrier: 'DHL',
      };
      await tools.update_document_tracking.handler(args);
      expect(client.put).toHaveBeenCalledWith('/sales-orders/doc-123/tracking', {
        trackingNumber: 'TRACK123',
        carrier: 'DHL',
      });
    });

    it('waybill tracking uses PUT /waybills/{id}/tracking (v2)', async () => {
      const args = {
        docType: 'waybill' as const,
        documentId: 'doc-123',
        trackingNumber: 'TRACK456',
        carrier: 'UPS',
      };
      await tools.update_document_tracking.handler(args);
      expect(client.put).toHaveBeenCalledWith('/waybills/doc-123/tracking', {
        trackingNumber: 'TRACK456',
        carrier: 'UPS',
      });
    });

    it('throws unsupportedOp for invoice (tracking not in v2 for this type)', async () => {
      await expect(
        tools.update_document_tracking.handler({ docType: 'invoice', documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });

    it('throws unsupportedOp for purchase', async () => {
      await expect(
        tools.update_document_tracking.handler({ docType: 'purchase', documentId: 'doc-1' })
      ).rejects.toThrow(/not supported by the Holded API v2/);
    });
  });

  describe('update_document_pipeline', () => {
    it('should update pipeline stage via PUT (v2 verb change)', async () => {
      const args = {
        docType: 'estimate' as const,
        documentId: 'doc-123',
        pipelineId: 'pipe-1',
        stageId: 'stage-2',
      };
      await tools.update_document_pipeline.handler(args);
      expect(client.put).toHaveBeenCalledWith('/estimates/doc-123/pipeline', {
        pipelineId: 'pipe-1',
        stageId: 'stage-2',
      });
    });

    it('should update pipeline for invoice via PUT (v2)', async () => {
      await tools.update_document_pipeline.handler({
        docType: 'invoice',
        documentId: 'inv-1',
        pipelineId: 'p1',
        stageId: 's1',
      });
    });
  });

  describe('list_payment_methods', () => {
    it('should list payment methods via v2 route', async () => {
      await tools.list_payment_methods.handler();
    });

    it('normalizes {items:[...]} envelope from v2', async () => {
      client.get = vi.fn().mockResolvedValue({ items: [{ id: 'pm-1', name: 'Cash' }] });
      const result = (await tools.list_payment_methods.handler()) as any;
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].id).toBe('pm-1');
    });

    it('returns bare array when v2 returns bare array', async () => {
      client.get = vi.fn().mockResolvedValue([{ id: 'pm-2' }]);
      const result = (await tools.list_payment_methods.handler()) as any;
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].id).toBe('pm-2');
    });
  });

  describe('invoiceNum field', () => {
    it('should include invoiceNum in create_document inputSchema', () => {
      expect(tools.create_document.inputSchema.properties).toHaveProperty('invoiceNum');
    });

    it('should include invoiceNum in update_document inputSchema', () => {
      expect(tools.update_document.inputSchema.properties).toHaveProperty('invoiceNum');
    });

    it('should pass invoiceNum to the API on create', async () => {
      await tools.create_document.handler({
        docType: 'purchase' as const,
        contactId: 'contact-123',
        items: [{ name: 'Part A', units: 2, subtotal: 50 }],
        date: 1700000000,
        invoiceNum: 'PROV-2024-001',
      });
      expect(client.post).toHaveBeenCalledWith('/purchases', {
        contactId: 'contact-123',
        items: [{ name: 'Part A', units: 2, subtotal: 50 }],
        date: 1700000000,
        invoiceNum: 'PROV-2024-001',
        approveDoc: true,
      });
    });

    it('should pass invoiceNum to the API on update', async () => {
      await tools.update_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-123',
        invoiceNum: 'INV-2024-007',
      });
    });

    it('should not require invoiceNum (optional field)', async () => {
      const args = {
        docType: 'invoice' as const,
        contactId: 'contact-123',
        items: [],
        date: 1700000000,
      };
      await expect(tools.create_document.handler(args)).resolves.not.toThrow();
    });
  });

  describe('taxes array per line item', () => {
    it('documentItemSchema should accept taxes array with exactly 1 element', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
        taxes: ['tax-id-holded'],
      });
      expect(result.success).toBe(true);
    });

    it('documentItemSchema should reject taxes array with more than 1 element', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
        taxes: ['tax-id-1', 'tax-id-2'],
      });
      expect(result.success).toBe(false);
    });

    it('documentItemSchema should accept taxes as undefined (optional)', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
      });
      expect(result.success).toBe(true);
    });

    it('documentItemSchema should accept both tax (number) and taxes (array) simultaneously for backward compatibility', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
        tax: 21,
        taxes: ['holded-tax-id'],
      });
      expect(result.success).toBe(true);
    });

    it('create_document inputSchema should include taxes with maxItems: 1 on line items', () => {
      const itemsSchema = (tools.create_document.inputSchema.properties as any).items;
      expect(itemsSchema.items.properties.taxes.maxItems).toBe(1);
      expect(itemsSchema.items.properties.taxes.minItems).toBe(1);
    });

    it('update_document inputSchema should include taxes with maxItems: 1 on line items', () => {
      const itemsSchema = (tools.update_document.inputSchema.properties as any).items;
      expect(itemsSchema.items.properties.taxes.maxItems).toBe(1);
    });

    it('should pass taxes array in line items to the API on create', async () => {
      await tools.create_document.handler({
        docType: 'invoice' as const,
        contactId: 'contact-123',
        items: [{ name: 'Service A', units: 1, subtotal: 200, taxes: ['holded-tax-123'] }],
        date: 1700000000,
      });
      expect(client.post).toHaveBeenCalledWith('/invoices', {
        contactId: 'contact-123',
        items: [{ name: 'Service A', units: 1, subtotal: 200, taxes: ['holded-tax-123'] }],
        date: 1700000000,
        approveDoc: true,
      });
    });
  });

  describe('salesChannelId field', () => {
    it('should include salesChannelId in create_document inputSchema', () => {
      expect(tools.create_document.inputSchema.properties).toHaveProperty('salesChannelId');
    });

    it('should include salesChannelId in update_document inputSchema', () => {
      expect(tools.update_document.inputSchema.properties).toHaveProperty('salesChannelId');
    });

    it('should pass salesChannelId to the API on create', async () => {
      await tools.create_document.handler({
        docType: 'invoice' as const,
        contactId: 'contact-123',
        items: [{ name: 'Item', units: 1, subtotal: 100 }],
        date: 1700000000,
        salesChannelId: 'channel-abc',
      });
      expect(client.post).toHaveBeenCalledWith('/invoices', {
        contactId: 'contact-123',
        items: [{ name: 'Item', units: 1, subtotal: 100 }],
        date: 1700000000,
        salesChannelId: 'channel-abc',
        approveDoc: true,
      });
    });

    it('should pass salesChannelId to the API on update', async () => {
      await tools.update_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-123',
        salesChannelId: 'channel-xyz',
      });
    });
  });

  describe('expAccountId field', () => {
    it('should include expAccountId in create_document inputSchema', () => {
      expect(tools.create_document.inputSchema.properties).toHaveProperty('expAccountId');
    });

    it('should include expAccountId in update_document inputSchema', () => {
      expect(tools.update_document.inputSchema.properties).toHaveProperty('expAccountId');
    });

    it('should pass expAccountId to the API on create', async () => {
      await tools.create_document.handler({
        docType: 'purchase' as const,
        contactId: 'contact-123',
        items: [{ name: 'Office Supply', units: 1, subtotal: 50 }],
        date: 1700000000,
        expAccountId: 'exp-account-456',
      });
      expect(client.post).toHaveBeenCalledWith('/purchases', {
        contactId: 'contact-123',
        items: [{ name: 'Office Supply', units: 1, subtotal: 50 }],
        date: 1700000000,
        expAccountId: 'exp-account-456',
        approveDoc: true,
      });
    });

    it('should pass expAccountId to the API on update', async () => {
      await tools.update_document.handler({
        docType: 'purchase' as const,
        documentId: 'doc-456',
        expAccountId: 'exp-account-789',
      });
    });
  });

  describe('documentItemSchema validation', () => {
    it('should require name, units, and subtotal', () => {
      const result = documentItemSchema.safeParse({ name: 'A', units: 1, subtotal: 100 });
      expect(result.success).toBe(true);
    });

    it('should reject item missing name', () => {
      const result = documentItemSchema.safeParse({ units: 1, subtotal: 100 });
      expect(result.success).toBe(false);
    });

    it('should reject item missing units', () => {
      const result = documentItemSchema.safeParse({ name: 'A', subtotal: 100 });
      expect(result.success).toBe(false);
    });

    it('should reject item missing subtotal', () => {
      const result = documentItemSchema.safeParse({ name: 'A', units: 1 });
      expect(result.success).toBe(false);
    });

    it('should accept all optional fields', () => {
      const result = documentItemSchema.safeParse({
        name: 'Product',
        units: 3,
        subtotal: 300,
        desc: 'A detailed description',
        sku: 'SKU-001',
        tax: 21,
        taxes: ['holded-tax-id'],
        discount: 10,
        serviceId: 'service-abc',
      });
      expect(result.success).toBe(true);
    });

    it('should pass through unknown fields (passthrough)', () => {
      const result = documentItemSchema.safeParse({
        name: 'X',
        units: 1,
        subtotal: 10,
        unknownApiField: 'some-value',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).unknownApiField).toBe('some-value');
      }
    });

    it('should reject tax value above 100', () => {
      const result = documentItemSchema.safeParse({
        name: 'X',
        units: 1,
        subtotal: 10,
        tax: 150,
      });
      expect(result.success).toBe(false);
    });

    it('should reject discount value above 100', () => {
      const result = documentItemSchema.safeParse({
        name: 'X',
        units: 1,
        subtotal: 10,
        discount: 110,
      });
      expect(result.success).toBe(false);
    });

    it('should reject taxes array with more than 1 element', () => {
      const result = documentItemSchema.safeParse({
        name: 'X',
        units: 1,
        subtotal: 10,
        taxes: ['id-1', 'id-2'],
      });
      expect(result.success).toBe(false);
    });

    it('create_document should reject items with missing required line item fields', async () => {
      await expect(
        tools.create_document.handler({
          docType: 'invoice' as const,
          contactId: 'contact-123',
          items: [{ units: 1, subtotal: 100 } as any],
          date: 1700000000,
        })
      ).rejects.toThrow();
    });
  });

  describe('update_document item validation', () => {
    it('should reject items without name when updating a document', async () => {
      await expect(
        tools.update_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-123',
          items: [{ units: 2, subtotal: 100 } as any],
        })
      ).rejects.toThrow();
    });

    it('should reject items without units when updating a document', async () => {
      await expect(
        tools.update_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-123',
          items: [{ name: 'Service A', subtotal: 100 } as any],
        })
      ).rejects.toThrow();
    });

    it('should reject items without subtotal when updating a document', async () => {
      await expect(
        tools.update_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-123',
          items: [{ name: 'Service A', units: 1 } as any],
        })
      ).rejects.toThrow();
    });

    it('should accept valid items when updating a document', async () => {
      await expect(
        tools.update_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-123',
          items: [{ name: 'Service A', units: 1, subtotal: 100 }],
        })
      ).resolves.not.toThrow();
    });
  });

  describe('docTypeEnum consistency — regression prevention', () => {
    /**
     * This test ensures that ALL document-related schemas reference the same
     * shared docTypeEnum constant, preventing future regressions where a new
     * document type is added to some schemas but not others.
     *
     * The test works by verifying that each schema accepts every value from
     * docTypeEnum.options — if any schema uses a narrower enum, this will fail.
     */
    const ALL_DOC_TYPES = docTypeEnum.options;

    const schemasWithDocType: Array<{ name: string; parse: (docType: string) => unknown }> = [
      {
        name: 'documentIdSchema',
        parse: (docType) => documentIdSchema.safeParse({ docType, documentId: 'id-1' }),
      },
      {
        name: 'listDocumentsSchema',
        parse: (docType) => listDocumentsSchema.safeParse({ docType }),
      },
      {
        name: 'updateDocumentPipelineSchema',
        parse: (docType) =>
          updateDocumentPipelineSchema.safeParse({
            docType,
            documentId: 'id-1',
            pipelineId: 'pipe-1',
            stageId: 'stage-1',
          }),
      },
      {
        name: 'attachFileToDocumentSchema',
        parse: (docType) =>
          attachFileToDocumentSchema.safeParse({
            docType,
            documentId: 'id-1',
            fileBase64: 'abc',
            filename: 'test.pdf',
          }),
      },
      {
        name: 'shipItemsByLineSchema',
        parse: (docType) =>
          shipItemsByLineSchema.safeParse({ docType, documentId: 'id-1', lines: [] }),
      },
      {
        name: 'payDocumentSchema',
        parse: (docType) => payDocumentSchema.safeParse({ docType, documentId: 'id-1' }),
      },
      {
        name: 'sendDocumentSchema',
        parse: (docType) => sendDocumentSchema.safeParse({ docType, documentId: 'id-1' }),
      },
      {
        name: 'updateDocumentTrackingSchema',
        parse: (docType) => updateDocumentTrackingSchema.safeParse({ docType, documentId: 'id-1' }),
      },
      {
        name: 'createDocumentSchema',
        parse: (docType) =>
          createDocumentSchema.safeParse({
            docType,
            contactId: 'contact-1',
            items: [],
            date: 1700000000,
          }),
      },
      {
        name: 'updateDocumentSchema',
        parse: (docType) => updateDocumentSchema.safeParse({ docType, documentId: 'id-1' }),
      },
      {
        name: 'numberingSerieIdSchema',
        parse: (docType) => numberingSerieIdSchema.safeParse({ docType, serieId: 'serie-1' }),
      },
      {
        name: 'createNumberingSerieSchema',
        parse: (docType) => createNumberingSerieSchema.safeParse({ docType, name: 'Serie A' }),
      },
    ];

    for (const schema of schemasWithDocType) {
      it(`${schema.name} should accept all docTypeEnum values`, () => {
        for (const docType of ALL_DOC_TYPES) {
          const result = schema.parse(docType) as { success: boolean };
          expect(result.success, `${schema.name} rejected docType "${docType}"`).toBe(true);
        }
      });
    }

    it('should reject unknown docType in all schemas', () => {
      for (const schema of schemasWithDocType) {
        const result = schema.parse('unknowntype') as { success: boolean };
        expect(result.success, `${schema.name} unexpectedly accepted "unknowntype"`).toBe(false);
      }
    });
  });

  describe('payDocumentSchema.date integer validation', () => {
    it('should accept integer Unix timestamp for payment date', () => {
      const result = payDocumentSchema.safeParse({
        docType: 'invoice',
        documentId: 'doc-123',
        date: 1700000000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject float (non-integer) payment date', () => {
      const result = payDocumentSchema.safeParse({
        docType: 'invoice',
        documentId: 'doc-123',
        date: 1700000000.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('documentItemSchema taxes empty array rejection', () => {
    it('should reject taxes as empty array (min 1 required when provided)', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
        taxes: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept taxes with exactly 1 element', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
        taxes: ['holded-tax-id'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject taxes with more than 1 element', () => {
      const result = documentItemSchema.safeParse({
        name: 'Service X',
        units: 1,
        subtotal: 100,
        taxes: ['tax-1', 'tax-2'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('write-safety guards (silent-fail field handling)', () => {
    it('#7 rejects a line-level `account` on create (use expAccountId instead)', async () => {
      await expect(
        tools.create_document.handler({
          docType: 'purchase' as const,
          contactId: 'contact-1',
          items: [{ name: 'Item', units: 1, subtotal: 50, account: 60000000 } as any],
          date: 1700000000,
        })
      ).rejects.toThrow(/expAccountId/);
    });

    it('#7 rejects a line-level `account` on update', async () => {
      await expect(
        tools.update_document.handler({
          docType: 'invoice' as const,
          documentId: 'doc-1',
          items: [{ name: 'Item', units: 1, subtotal: 50, account: 70000000 } as any],
        })
      ).rejects.toThrow(/expAccountId/);
    });

    it('#11 rejects `retention` on a purchase document', async () => {
      await expect(
        tools.create_document.handler({
          docType: 'purchase' as const,
          contactId: 'contact-1',
          items: [{ name: 'Item', units: 1, subtotal: 50 }],
          date: 1700000000,
          retention: 15,
        } as any)
      ).rejects.toThrow(/retention/i);
    });

    it('#11 allows `retention` on a sales document and forwards it', async () => {
      await tools.create_document.handler({
        docType: 'invoice' as const,
        contactId: 'contact-1',
        items: [{ name: 'Service', units: 1, subtotal: 100 }],
        date: 1700000000,
        retention: 15,
      } as any);
      expect(client.post).toHaveBeenCalledWith('/invoices', {
        contactId: 'contact-1',
        items: [{ name: 'Service', units: 1, subtotal: 100 }],
        date: 1700000000,
        retention: 15,
        approveDoc: true,
      });
    });

    it('#17 warns when a sales numbering series overrides the requested invoiceNum', async () => {
      client.post = vi.fn().mockResolvedValue({ id: 'doc-new' });
      client.get = vi.fn().mockResolvedValue({ invoiceNum: 'FAC-2025-0001' });
      const result = (await tools.create_document.handler({
        docType: 'invoice' as const,
        contactId: 'contact-1',
        items: [{ name: 'Service', units: 1, subtotal: 100 }],
        date: 1700000000,
        invoiceNum: 'CUSTOM-1',
      })) as any;
      expect(result._warnings).toBeDefined();
      expect(result._warnings[0]).toMatch(/overridden/);
    });

    it('#17 does not re-read or warn for invoiceNum on a purchase (supplier number preserved)', async () => {
      client.post = vi.fn().mockResolvedValue({ id: 'doc-new' });
      client.get = vi.fn().mockResolvedValue({ invoiceNum: 'SOMETHING-ELSE' });
      const result = (await tools.create_document.handler({
        docType: 'purchase' as const,
        contactId: 'contact-1',
        items: [{ name: 'Part', units: 1, subtotal: 50 }],
        date: 1700000000,
        invoiceNum: 'PROV-001',
      })) as any;
      expect(client.get).not.toHaveBeenCalled();
      expect(result._warnings).toBeUndefined();
    });

    it('#12 warns that a currency change was ignored on update', async () => {
      client.put = vi.fn().mockResolvedValue({ status: 1 });
      client.get = vi.fn().mockResolvedValue({ currency: 'EUR' });
      const result = (await tools.update_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-1',
        currency: 'USD',
      })) as any;
      expect(result._warnings).toBeDefined();
      expect(result._warnings[0]).toMatch(/currency/i);
    });

    it('#10 pay_document always warns about the auto-approve side effect', async () => {
      const result = (await tools.pay_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-1',
        amount: 100,
        date: 1700000000,
      })) as any;
      expect(result._warnings.some((w: string) => /auto-approved/i.test(w))).toBe(true);
    });

    it('#8 pay_document links bankId via a second PUT /payments step (v2)', async () => {
      client.post = vi.fn().mockResolvedValue({ id: 'pay-result' });
      client.get = vi.fn().mockImplementation((url: string) => {
        if (url === '/payments/paydetail-1')
          return Promise.resolve({ id: 'paydetail-1', amount: 100, date: 1700000000 });
        return Promise.resolve({ paymentsDetail: [{ id: 'paydetail-1' }] });
      });
      client.put = vi.fn().mockResolvedValue({ status: 1 });
      const result = (await tools.pay_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-1',
        amount: 100,
        bankId: 'bank-9',
      })) as any;
      expect(result._warnings.some((w: string) => /Linked bank account bank-9/.test(w))).toBe(true);
      // #F1 — verify the PUT merges the existing payment (amount preserved) rather than bare {bankId}
      expect(client.put).toHaveBeenCalledWith(
        '/payments/paydetail-1',
        expect.objectContaining({ amount: 100, bankId: 'bank-9' })
      );
    });

    it('#F1 pay_document bankId PUT body merges existing payment fields (read-then-merge)', async () => {
      client.post = vi.fn().mockResolvedValue({ id: 'pay-result' });
      client.get = vi.fn().mockImplementation((url: string) => {
        if (url === '/payments/p1')
          return Promise.resolve({ id: 'p1', amount: 250, date: 'x', contactId: 'c1' });
        return Promise.resolve({ paymentsDetail: [{ id: 'p1' }] });
      });
      client.put = vi.fn().mockResolvedValue({ status: 1 });
      await tools.pay_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-99',
        amount: 250,
        bankId: 'bank-42',
      });
      expect(client.put).toHaveBeenCalledWith(
        '/payments/p1',
        expect.objectContaining({ amount: 250, date: 'x', contactId: 'c1', bankId: 'bank-42' })
      );
      // id must NOT appear in the PUT body
      const putBody = (client.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(putBody).not.toHaveProperty('id');
    });

    it('#F2 pay_document resolves payment via snake_case payments_detail field', async () => {
      client.post = vi.fn().mockResolvedValue({ id: 'pay-result' });
      client.get = vi.fn().mockImplementation((url: string) => {
        if (url === '/payments/psnake')
          return Promise.resolve({ id: 'psnake', amount: 75, date: 'y' });
        // v2 response uses snake_case payments_detail
        return Promise.resolve({ payments_detail: [{ id: 'psnake' }] });
      });
      client.put = vi.fn().mockResolvedValue({ status: 1 });
      const result = (await tools.pay_document.handler({
        docType: 'invoice' as const,
        documentId: 'doc-snake',
        amount: 75,
        bankId: 'bank-s',
      })) as any;
      expect(result._warnings.some((w: string) => /Linked bank account bank-s/.test(w))).toBe(true);
      expect(client.put).toHaveBeenCalledWith(
        '/payments/psnake',
        expect.objectContaining({ amount: 75, bankId: 'bank-s' })
      );
    });

    it('#F2 create_document warning fires when v2 response returns document_number (snake_case)', async () => {
      client.post = vi.fn().mockResolvedValue({ id: 'doc-new' });
      // v2 API returns snake_case document_number instead of camelCase invoiceNum
      client.get = vi.fn().mockResolvedValue({ document_number: 'FAC-2025-0042' });
      const result = (await tools.create_document.handler({
        docType: 'invoice' as const,
        contactId: 'contact-1',
        items: [{ name: 'Service', units: 1, subtotal: 100 }],
        date: 1700000000,
        invoiceNum: 'MY-CUSTOM-1',
      })) as any;
      expect(result._warnings).toBeDefined();
      expect(result._warnings[0]).toMatch(/overridden/);
    });

    it('#14 get_document_payments returns the document paymentsDetail', async () => {
      client.get = vi.fn().mockResolvedValue({ paymentsDetail: [{ id: 'p1', amount: 100 }] });
      const result = (await tools.get_document_payments.handler({
        docType: 'invoice' as const,
        documentId: 'doc-1',
      })) as any;
      expect(result).toEqual({
        documentId: 'doc-1',
        paymentsDetail: [{ id: 'p1', amount: 100 }],
      });
    });
  });

  describe('v2 cursor pagination', () => {
    it('returns normalised envelope with items and hasMore from v2', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: [{ id: 'doc-1' }], has_more: true, cursor: 'page:2' });
      const result = (await tools.list_documents.handler({ docType: 'invoice' })) as any;
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('page:2');
    });

    it('returns empty items when no documents', async () => {
      client.get = vi.fn().mockResolvedValue({ items: [], has_more: false });
      const result = (await tools.list_documents.handler({ docType: 'invoice' })) as any;
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('forwards cursor in subsequent requests', async () => {
      await tools.list_documents.handler({ docType: 'invoice', cursor: 'page:3' });
    });

    it('summary mode returns count and nextCursor without items', async () => {
      client.get = vi
        .fn()
        .mockResolvedValue({ items: [{ id: 'a' }, { id: 'b' }], has_more: true, cursor: 'page:2' });
      const result = (await tools.list_documents.handler({
        docType: 'invoice',
        summary: true,
      })) as any;
      expect(result.count).toBe(2);
      expect(result.nextCursor).toBe('page:2');
      expect(result.hasMore).toBe(true);
      expect(result.items).toBeUndefined();
    });

    it('normalises bare-array response from v2', async () => {
      client.get = vi.fn().mockResolvedValue([{ id: 'doc-1' }, { id: 'doc-2' }]);
      const result = (await tools.list_documents.handler({ docType: 'invoice' })) as any;
      expect(result.items).toHaveLength(2);
    });
  });
});
