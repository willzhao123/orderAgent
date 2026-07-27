import type { Pool, PoolClient } from "pg";
import type { Order, OrderItem, OrderQuote, OrderStatus } from "./domain.ts";
import type { OrderStore } from "./orderService.ts";
import type { CreateDraftOrderInput } from "./repositories.ts";

type Queryable = Pool | PoolClient;

type OrderRow = {
  id: string;
  session_id: string;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  created_at: Date;
  updated_at: Date;
};

type OrderItemRow = {
  id: string;
  menu_item_id: string | null;
  name: string;
  quantity: number;
  unit_price: string | null;
  notes: string | null;
  modifiers: OrderItem["modifiers"];
};

function money(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function itemTotal(item: OrderItem): number {
  return item.unitPrice === undefined ? 0 : item.unitPrice * item.quantity;
}

export class PostgresOrderStore implements OrderStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createDraftOrder(input: CreateDraftOrderInput): Promise<Order> {
    if (!input.conversationSessionId) {
      throw new Error("A chat session is required to create a Postgres order.");
    }

    const items = input.items ?? [];
    const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string }>(
        `INSERT INTO orders (
           session_id, status, customer_name, customer_phone, subtotal, tax, total
         )
         VALUES ($1, 'draft', $2, $3, $4, 0, $4)
         RETURNING id`,
        [
          input.conversationSessionId,
          input.customerName ?? null,
          input.customerPhone ?? null,
          subtotal
        ]
      );
      const orderId = result.rows[0]!.id;
      await this.insertItems(client, orderId, items);
      await client.query("COMMIT");
      return (await this.readOrder(client, orderId))!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrder(orderId: string): Promise<Order | undefined> {
    return this.readOrder(this.pool, orderId);
  }

  async updateOrderItems(orderId: string, items: OrderItem[]): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query(
        "SELECT 1 FROM orders WHERE id = $1 FOR UPDATE",
        [orderId]
      );
      if (exists.rowCount === 0) throw new Error(`No order matches id: ${orderId}`);

      await client.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
      await this.insertItems(client, orderId, items);
      const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
      await client.query(
        `UPDATE orders
         SET status = 'draft', subtotal = $2, tax = 0, total = $2, updated_at = now()
         WHERE id = $1`,
        [orderId, subtotal]
      );
      await client.query("COMMIT");
      return (await this.readOrder(client, orderId))!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async clearOrderItems(orderId: string): Promise<Order> {
    return this.updateOrderItems(orderId, []);
  }

  async identifyMissingOrderInformation(orderId: string): Promise<string[]> {
    const order = await this.getOrder(orderId);
    if (!order) throw new Error(`No order matches id: ${orderId}`);
    return [
      ...(order.items.length === 0 ? ["items"] : []),
      "fulfillment_type",
      ...(!order.customerPhone ? ["customer_phone"] : [])
    ];
  }

  async quoteOrder(orderId: string): Promise<OrderQuote> {
    const order = await this.getOrder(orderId);
    if (!order) throw new Error(`No order matches id: ${orderId}`);
    return {
      id: `quote_${order.id}`,
      orderId: order.id,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      currency: "USD",
      missingInformation: await this.identifyMissingOrderInformation(order.id),
      createdAt: new Date().toISOString()
    };
  }

  private async readOrder(queryable: Queryable, orderId: string): Promise<Order | undefined> {
    const orderResult = await queryable.query<OrderRow>(
      `SELECT id, session_id, status, customer_name, customer_phone,
              subtotal, tax, total, created_at, updated_at
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    const row = orderResult.rows[0];
    if (!row) return undefined;

    const itemResult = await queryable.query<OrderItemRow>(
      `SELECT id, menu_item_id, name, quantity, unit_price, notes, modifiers
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    );
    return {
      id: row.id,
      businessId: "business_0001",
      conversationSessionId: row.session_id,
      status: row.status,
      items: itemResult.rows.map((item) => ({
        id: item.id,
        menuItemId: item.menu_item_id ?? "",
        name: item.name,
        quantity: item.quantity,
        ...(item.unit_price === null
          ? {}
          : {
              unitPrice: money(item.unit_price),
              lineTotal: money(item.unit_price) * item.quantity
            }),
        modifiers: item.modifiers,
        ...(item.notes ? { notes: item.notes, specialInstructions: item.notes } : {})
      })),
      subtotal: money(row.subtotal),
      tax: money(row.tax),
      total: money(row.total),
      currency: "USD",
      ...(row.customer_name ? { customerName: row.customer_name } : {}),
      ...(row.customer_phone ? { customerPhone: row.customer_phone } : {}),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  private async insertItems(
    client: PoolClient,
    orderId: string,
    items: OrderItem[]
  ): Promise<void> {
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (
           order_id, menu_item_id, name, quantity, unit_price, notes, modifiers
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          orderId,
          item.menuItemId || null,
          item.name,
          item.quantity,
          item.unitPrice ?? null,
          item.notes ?? null,
          JSON.stringify(item.modifiers)
        ]
      );
    }
  }
}
