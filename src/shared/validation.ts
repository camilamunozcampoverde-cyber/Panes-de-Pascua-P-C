import {
  CATALOG,
  CATALOG_BY_KEY,
  FLAVORS,
  MAX_SPLIT_DATES,
  SPLIT_DELIVERY_MIN_BREADS,
  WHOLESALE_MIN_BREADS,
  centsToNumber,
  formatCentsUSD,
  formatEcuadorDateReadable,
  getNowEcuador,
  parseEcuadorDateTimeMs,
  type FlavorId,
  type ProductSku,
  type SkuKey,
} from './catalog.ts';

export type CartQuantities = Record<SkuKey, number>;

export interface DeliveryAllocationInput {
  id?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  items: Partial<Record<SkuKey, number>>;
}

export interface OrderSubmissionPayload {
  idempotencyKey: string;
  customerName: string;
  quantities: Partial<Record<SkuKey, number>>;
  splitDeliveries: boolean;
  deliveries: DeliveryAllocationInput[];
  spreadsheetId?: string;
}

export interface OrderLineItem {
  sku: ProductSku;
  quantity: number;
  subtotalCents: number;
  regularSubtotalCents: number;
}

export interface NormalizedDelivery {
  date: string;
  time: string;
  epochMs: number;
  totalBreads: number;
  items: Array<{
    sku: ProductSku;
    quantity: number;
  }>;
}

export interface ValidatedOrder {
  idempotencyKey: string;
  customerName: string;
  lineItems: OrderLineItem[];
  totalBreads: number;
  totalCents: number;
  regularTotalCents: number;
  savingsCents: number;
  totalUsdNumber: number;
  splitDeliveries: boolean;
  sortedDeliveries: NormalizedDelivery[];
  firstDeliveryDate: string;
  firstDeliveryTime: string;
  detailText: string;
  fillingsText: string;
  scheduledDeliveriesText: string;
}

export interface OrderValidationResult {
  valid: boolean;
  errors: string[];
  validated?: ValidatedOrder;
}

export function createEmptyCart(): CartQuantities {
  const cart = {} as CartQuantities;
  for (const item of CATALOG) {
    cart[item.key] = 0;
  }
  return cart;
}

export function sanitizeIntegerQuantity(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
    return parsed;
  }
  return null;
}

export function computeCartSummary(quantities: Partial<Record<SkuKey, number>>) {
  const lineItems: OrderLineItem[] = [];
  let totalBreads = 0;
  let totalCents = 0;
  let regularTotalCents = 0;

  for (const sku of CATALOG) {
    const raw = quantities[sku.key] ?? 0;
    const qty = Number.isInteger(raw) && raw > 0 ? raw : 0;
    if (qty > 0) {
      const subtotalCents = qty * sku.wholesaleCents;
      const regularSubtotalCents = qty * sku.regularCents;
      lineItems.push({
        sku,
        quantity: qty,
        subtotalCents,
        regularSubtotalCents,
      });
      totalBreads += qty;
      totalCents += subtotalCents;
      regularTotalCents += regularSubtotalCents;
    }
  }

  return {
    lineItems,
    totalBreads,
    totalCents,
    regularTotalCents,
    savingsCents: Math.max(0, regularTotalCents - totalCents),
    missingForMin: Math.max(0, WHOLESALE_MIN_BREADS - totalBreads),
    canSplitDeliveries: totalBreads >= SPLIT_DELIVERY_MIN_BREADS,
  };
}

export function validateOrderPayload(
  payload: OrderSubmissionPayload,
  nowDate: Date = new Date(),
): OrderValidationResult {
  const errors: string[] = [];

  const idempotencyKey =
    typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : '';
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    errors.push('Identificador de envío inválido. Intenta nuevamente.');
  }

  const customerName =
    typeof payload.customerName === 'string'
      ? payload.customerName.replace(/\s+/g, ' ').trim()
      : '';
  if (customerName.length < 3) {
    errors.push('Ingresa tu nombre completo (mínimo 3 caracteres).');
  } else if (customerName.length > 140) {
    errors.push('El nombre completo no puede superar 140 caracteres.');
  }

  // Validate quantities strictly
  const cleanQuantities: CartQuantities = createEmptyCart();
  if (!payload.quantities || typeof payload.quantities !== 'object') {
    errors.push('No se recibieron las cantidades del pedido.');
  } else {
    for (const key of Object.keys(payload.quantities)) {
      if (!(key in CATALOG_BY_KEY)) {
        errors.push(`Producto no reconocido en el pedido: ${key}`);
      }
    }
    for (const sku of CATALOG) {
      const raw = payload.quantities[sku.key];
      if (raw === undefined || raw === null) {
        cleanQuantities[sku.key] = 0;
        continue;
      }
      const parsed = sanitizeIntegerQuantity(raw);
      if (parsed === null) {
        errors.push(
          `La cantidad para ${sku.flavor} ${sku.weight} debe ser un número entero desde 0.`,
        );
      } else if (parsed > 50000) {
        errors.push(`La cantidad para ${sku.flavor} ${sku.weight} excede el límite permitido.`);
      } else {
        cleanQuantities[sku.key] = parsed;
      }
    }
  }

  const summary = computeCartSummary(cleanQuantities);
  if (summary.totalBreads < WHOLESALE_MIN_BREADS) {
    const missing = WHOLESALE_MIN_BREADS - summary.totalBreads;
    errors.push(
      missing === 1
        ? 'Falta 1 pan para alcanzar el pedido mínimo mayorista de 20 panes.'
        : `Faltan ${missing} panes para alcanzar el pedido mínimo mayorista de 20 panes.`,
    );
  }

  // Validate delivery configuration
  const wantsSplit = Boolean(payload.splitDeliveries);
  if (wantsSplit && summary.totalBreads < SPLIT_DELIVERY_MIN_BREADS) {
    errors.push(
      `La opción de dividir entregas está disponible únicamente desde ${SPLIT_DELIVERY_MIN_BREADS} panes.`,
    );
  }

  const rawDeliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];
  if (!wantsSplit) {
    if (rawDeliveries.length !== 1) {
      errors.push('Debes indicar exactamente una fecha y hora de entrega.');
    }
  } else {
    if (rawDeliveries.length < 2 || rawDeliveries.length > MAX_SPLIT_DATES) {
      errors.push('Al dividir tu pedido debes elegir entre 2 y 3 fechas distintas.');
    }
  }

  const nowEcuador = getNowEcuador(nowDate);
  const nowMs = nowEcuador.epochMs;

  const seenDates = new Set<string>();
  const normalizedDeliveries: NormalizedDelivery[] = [];
  const allocatedTotals: Record<SkuKey, number> = createEmptyCart();

  rawDeliveries.forEach((delivery, idx) => {
    const label = wantsSplit ? `Entrega ${idx + 1}` : 'La entrega';
    const dateStr = typeof delivery?.date === 'string' ? delivery.date.trim() : '';
    const timeStr = typeof delivery?.time === 'string' ? delivery.time.trim() : '';

    if (!dateStr || !timeStr) {
      errors.push(`${label}: selecciona una fecha y hora de entrega.`);
      return;
    }

    const epochMs = parseEcuadorDateTimeMs(dateStr, timeStr);
    if (epochMs === null) {
      errors.push(`${label}: formato de fecha u hora inválido.`);
      return;
    }

    if (epochMs <= nowMs) {
      errors.push(
        `${label} (${formatEcuadorDateReadable(dateStr)} ${timeStr}): elige un horario futuro (hora de Ecuador).`,
      );
    }

    if (wantsSplit) {
      if (seenDates.has(dateStr)) {
        errors.push(
          `La fecha ${formatEcuadorDateReadable(dateStr)} está repetida. Cada entrega debe tener una fecha distinta.`,
        );
      }
      seenDates.add(dateStr);
    }

    const deliveryItems: Array<{ sku: ProductSku; quantity: number }> = [];
    let deliveryTotal = 0;

    if (!wantsSplit) {
      // Single delivery automatically contains the entire cart
      for (const line of summary.lineItems) {
        deliveryItems.push({ sku: line.sku, quantity: line.quantity });
        deliveryTotal += line.quantity;
        allocatedTotals[line.sku.key] += line.quantity;
      }
    } else {
      const itemMap = delivery?.items ?? {};
      for (const key of Object.keys(itemMap)) {
        if (!(key in CATALOG_BY_KEY)) {
          errors.push(`${label}: producto inválido (${key}).`);
        }
      }
      for (const line of summary.lineItems) {
        const rawQty = itemMap[line.sku.key] ?? 0;
        const parsedQty = sanitizeIntegerQuantity(rawQty);
        if (parsedQty === null) {
          errors.push(
            `${label}: la cantidad asignada de ${line.sku.flavor} ${line.sku.weight} debe ser un número entero desde 0.`,
          );
          continue;
        }
        if (parsedQty > 0) {
          deliveryItems.push({ sku: line.sku, quantity: parsedQty });
          deliveryTotal += parsedQty;
          allocatedTotals[line.sku.key] += parsedQty;
        }
      }
      // Also ensure no quantity was assigned to a SKU with 0 in cart
      for (const sku of CATALOG) {
        if (cleanQuantities[sku.key] === 0) {
          const extra = sanitizeIntegerQuantity(itemMap[sku.key] ?? 0);
          if (extra && extra > 0) {
            errors.push(
              `${label}: asignaste ${sku.flavor} ${sku.weight}, pero no está incluido en tu carrito.`,
            );
          }
        }
      }

      if (deliveryTotal < 1) {
        errors.push(
          `${label} (${formatEcuadorDateReadable(dateStr)}): debe incluir al menos 1 pan.`,
        );
      }
    }

    normalizedDeliveries.push({
      date: dateStr,
      time: timeStr,
      epochMs,
      totalBreads: deliveryTotal,
      items: deliveryItems,
    });
  });

  // Verify exact SKU allocation match when split
  if (wantsSplit && summary.lineItems.length > 0) {
    for (const line of summary.lineItems) {
      const assigned = allocatedTotals[line.sku.key];
      if (assigned !== line.quantity) {
        const diff = line.quantity - assigned;
        if (diff > 0) {
          errors.push(
            `Faltan repartir ${diff} panes de ${line.sku.flavor} ${line.sku.weight} entre tus fechas.`,
          );
        } else {
          errors.push(
            `Asignaste ${Math.abs(diff)} panes de más en ${line.sku.flavor} ${line.sku.weight}.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Sort deliveries chronologically
  const sortedDeliveries = [...normalizedDeliveries].sort((a, b) => a.epochMs - b.epochMs);

  const firstDelivery = sortedDeliveries[0];

  // Format Detalle: quantity, flavor, weight, wholesale price, subtotal per product
  const detailText = summary.lineItems
    .map(
      (line) =>
        `${line.quantity}x ${line.sku.flavor} ${line.sku.weight} (${formatCentsUSD(
          line.sku.wholesaleCents,
        )}) = ${formatCentsUSD(line.subtotalCents)}`,
    )
    .join('\n');

  // Format Rellenos: unique flavors in catalog order
  const activeFlavorSet = new Set<FlavorId>(summary.lineItems.map((l) => l.sku.flavor));
  const fillingsText = FLAVORS.filter((f) => activeFlavorSet.has(f.id))
    .map((f) => f.id)
    .join(', ');

  // Format Entregas programadas: empty if single delivery; otherwise 1 line per date with time & SKU breakdown
  const scheduledDeliveriesText =
    sortedDeliveries.length > 1
      ? sortedDeliveries
          .map((d) => {
            const breakdown = d.items
              .map((it) => `${it.quantity}x ${it.sku.flavor} ${it.sku.weight}`)
              .join(', ');
            return `${d.date} ${d.time}: ${breakdown} (${d.totalBreads} panes)`;
          })
          .join('\n')
      : '';

  return {
    valid: true,
    errors: [],
    validated: {
      idempotencyKey,
      customerName,
      lineItems: summary.lineItems,
      totalBreads: summary.totalBreads,
      totalCents: summary.totalCents,
      regularTotalCents: summary.regularTotalCents,
      savingsCents: summary.savingsCents,
      totalUsdNumber: centsToNumber(summary.totalCents),
      splitDeliveries: sortedDeliveries.length > 1,
      sortedDeliveries,
      firstDeliveryDate: firstDelivery.date,
      firstDeliveryTime: firstDelivery.time,
      detailText,
      fillingsText,
      scheduledDeliveriesText,
    },
  };
}
