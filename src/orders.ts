import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OrderLine } from "./domain.ts";

/**
 * @deprecated Use BackendDataStore and the canonical Order type from domain.ts.
 */
export type Order = {
  id: string;
  status: "created";
  items: OrderLine[];
  subtotal: number;
  currency: "USD";
  createdAt: string;
};

/**
 * @deprecated Active tool execution now uses BackendDataStore through OrderService.
 */
export class OrderStore {
  private readonly ordersPath: string;

  constructor(ordersPath: string) {
    this.ordersPath = ordersPath;
  }

  create(items: OrderLine[]): Order {
    const orders = this.readOrders();
    const order: Order = {
      id: `order_${String(orders.length + 1).padStart(4, "0")}`,
      status: "created",
      items,
      subtotal: items.reduce((total, item) => total + (item.lineTotal ?? 0), 0),
      currency: "USD",
      createdAt: new Date().toISOString()
    };

    this.writeOrders([...orders, order]);
    return order;
  }

  get(orderId: string): Order | undefined {
    return this.readOrders().find((order) => order.id === orderId);
  }

  update(orderId: string, items: OrderLine[]): Order | undefined {
    const orders = this.readOrders();
    const orderIndex = orders.findIndex((order) => order.id === orderId);
    if (orderIndex === -1) return undefined;

    const currentOrder = orders[orderIndex]!;
    const updatedOrder: Order = {
      ...currentOrder,
      items,
      subtotal: this.subtotal(items)
    };

    orders[orderIndex] = updatedOrder;
    this.writeOrders(orders);
    return updatedOrder;
  }

  list(): Order[] {
    return this.readOrders();
  }

  private subtotal(items: OrderLine[]): number {
    return items.reduce((total, item) => total + (item.lineTotal ?? 0), 0);
  }

  private readOrders(): Order[] {
    if (!existsSync(this.ordersPath)) return [];

    const contents = readFileSync(this.ordersPath, "utf8").trim();
    if (!contents) return [];

    const parsed = JSON.parse(contents) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`Orders file must contain a JSON array: ${this.ordersPath}`);
    }

    return parsed as Order[];
  }

  private writeOrders(orders: Order[]): void {
    mkdirSync(dirname(this.ordersPath), { recursive: true });
    writeFileSync(this.ordersPath, `${JSON.stringify(orders, null, 2)}\n`);
  }
}
