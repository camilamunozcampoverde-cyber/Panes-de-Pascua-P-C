import { Calendar, Clock, Minus, Plus, Split, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  SPLIT_DELIVERY_MIN_BREADS,
  formatEcuadorDateReadable,
  getNowEcuador,
  parseEcuadorDateTimeMs,
  type SkuKey,
} from '../shared/catalog.ts';
import type { DeliveryAllocationInput, OrderLineItem } from '../shared/validation.ts';

interface DeliverySchedulerProps {
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  totalBreads: number;
  lineItems: OrderLineItem[];
  splitDeliveries: boolean;
  onToggleSplitDeliveries: (enabled: boolean) => void;
  deliveries: DeliveryAllocationInput[];
  onDeliveryCountChange: (count: 2 | 3) => void;
  onUpdateDeliveryField: (index: number, field: 'date' | 'time', value: string) => void;
  onUpdateDeliveryItemQty: (index: number, skuKey: SkuKey, qty: number) => void;
  onAssignRemainingToDelivery: (index: number, skuKey: SkuKey) => void;
}

export function DeliveryScheduler({
  customerName,
  onCustomerNameChange,
  totalBreads,
  lineItems,
  splitDeliveries,
  onToggleSplitDeliveries,
  deliveries,
  onDeliveryCountChange,
  onUpdateDeliveryField,
  onUpdateDeliveryItemQty,
  onAssignRemainingToDelivery,
}: DeliverySchedulerProps) {
  const canSplit = totalBreads >= SPLIT_DELIVERY_MIN_BREADS;
  const nowEc = getNowEcuador();

  const remainingBySku: Record<string, number> = {};
  for (const line of lineItems) {
    const assigned = deliveries.reduce(
      (sum, d) => sum + (Number(d.items?.[line.sku.key]) || 0),
      0,
    );
    remainingBySku[line.sku.key] = line.quantity - assigned;
  }

  const sortedPreview = deliveries
    .map((d, idx) => ({
      idx,
      date: d.date,
      time: d.time,
      ms: parseEcuadorDateTimeMs(d.date, d.time),
      total: lineItems.reduce((s, li) => s + (Number(d.items?.[li.sku.key]) || 0), 0),
    }))
    .sort((a, b) => (a.ms ?? Number.MAX_SAFE_INTEGER) - (b.ms ?? Number.MAX_SAFE_INTEGER));

  return (
    <section
      aria-labelledby="datos-entrega-heading"
      className="rounded-2xl border border-[#D4A353]/35 bg-[#0F1F38]/94 p-5 sm:p-6 shadow-xl"
    >
      <div className="mb-5 border-b border-[#FAF4E8]/12 pb-4">
        <h2
          id="datos-entrega-heading"
          className="font-display text-2xl font-bold text-[#FAF4E8] tracking-tight"
        >
          Datos del cliente y entrega
        </h2>
        <p className="mt-1 text-sm text-[#FAF4E8]/75">
          Horario oficial de Ecuador (America/Guayaquil). No se permiten horarios pasados.
        </p>
      </div>

      {/* Customer Full Name */}
      <div className="mb-6">
        <label
          htmlFor="customer-full-name"
          className="block text-sm font-semibold text-[#FAF4E8] mb-2"
        >
          Nombre completo del cliente
        </label>
        <input
          id="customer-full-name"
          type="text"
          value={customerName}
          onChange={(e) => onCustomerNameChange(e.target.value)}
          placeholder="Ej. María Fernanda Zambrano"
          autoComplete="name"
          maxLength={140}
          className="w-full rounded-xl border border-[#D4A353]/35 bg-[#0A1629] px-4 py-3 text-base text-[#FAF4E8] placeholder:text-[#FAF4E8]/40 focus:border-[#D4A353] focus:outline-none focus:ring-2 focus:ring-[#D4A353]/35"
        />
      </div>

      {/* Split delivery toggle — ONLY shown from 50+ breads */}
      {canSplit && (
        <div className="mb-6 rounded-xl border border-[#D4A353]/35 bg-[#0B182E] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={splitDeliveries}
                onChange={(e) => onToggleSplitDeliveries(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-[#D4A353] accent-[#9E2A2B] cursor-pointer"
              />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold text-[#FAF4E8]">
                  <Split className="h-4 w-4 text-[#D4A353]" />
                  Dividir mi pedido en varias fechas
                </span>
                <span className="block text-xs text-[#FAF4E8]/70 mt-0.5">
                  Disponible desde 50 panes. Conserva una sola entrega o reparte tu pedido en 2 o 3 fechas distintas.
                </span>
              </span>
            </label>

            {splitDeliveries && (
              <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Número de fechas">
                <span className="text-xs font-medium text-[#FAF4E8]/75">Fechas:</span>
                {([2, 3] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onDeliveryCountChange(count)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      deliveries.length === count
                        ? 'bg-[#9E2A2B] text-[#FAF4E8]'
                        : 'bg-[#162C4F] text-[#FAF4E8]/80 hover:bg-[#1E3B69]'
                    }`}
                  >
                    {count} fechas
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single Delivery Date & Time (20–49 panes OR 50+ not split) */}
      {!splitDeliveries ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="single-delivery-date"
              className="flex items-center gap-1.5 text-sm font-semibold text-[#FAF4E8] mb-2"
            >
              <Calendar className="h-4 w-4 text-[#D4A353]" />
              Fecha de entrega
            </label>
            <input
              id="single-delivery-date"
              type="date"
              min={nowEc.date}
              value={deliveries[0]?.date || ''}
              onChange={(e) => onUpdateDeliveryField(0, 'date', e.target.value)}
              className="dark-picker w-full rounded-xl border border-[#D4A353]/35 bg-[#0A1629] px-4 py-3 text-base text-[#FAF4E8] focus:border-[#D4A353] focus:outline-none focus:ring-2 focus:ring-[#D4A353]/35 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="single-delivery-time"
              className="flex items-center gap-1.5 text-sm font-semibold text-[#FAF4E8] mb-2"
            >
              <Clock className="h-4 w-4 text-[#D4A353]" />
              Hora de entrega (Ecuador)
            </label>
            <input
              id="single-delivery-time"
              type="time"
              value={deliveries[0]?.time || ''}
              onChange={(e) => onUpdateDeliveryField(0, 'time', e.target.value)}
              className="dark-picker w-full rounded-xl border border-[#D4A353]/35 bg-[#0A1629] px-4 py-3 text-base text-[#FAF4E8] focus:border-[#D4A353] focus:outline-none focus:ring-2 focus:ring-[#D4A353]/35 tabular-nums"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Remaining tracker across cart SKUs */}
          <div className="rounded-xl border border-[#FAF4E8]/12 bg-[#0A1629] p-4">
            <h3 className="text-sm font-semibold text-[#FAF4E8] mb-3">
              Panes por repartir entre tus {deliveries.length} fechas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {lineItems.map((line) => {
                const rem = remainingBySku[line.sku.key] ?? 0;
                const isExact = rem === 0;
                const isOver = rem < 0;
                return (
                  <div
                    key={line.sku.key}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                      isExact
                        ? 'border-sky-400/45 bg-sky-950/50 text-sky-100'
                        : isOver
                        ? 'border-red-400/45 bg-red-950/45 text-red-200'
                        : 'border-[#D4A353]/30 bg-[#122645] text-[#FAF4E8]'
                    }`}
                  >
                    <span className="font-medium truncate">
                      {line.sku.flavor} {line.sku.weight}
                    </span>
                    <span className="font-semibold tabular-nums whitespace-nowrap shrink-0 flex items-center gap-1">
                      {isExact ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-sky-300" />
                          Completo ({line.quantity})
                        </>
                      ) : isOver ? (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                          Excede por {Math.abs(rem)}
                        </>
                      ) : (
                        <>Quedan {rem}</>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Individual delivery cards */}
          <div className="space-y-4">
            {deliveries.map((delivery, idx) => {
              const deliverySum = lineItems.reduce(
                (s, li) => s + (Number(delivery.items?.[li.sku.key]) || 0),
                0,
              );
              const dtMs = parseEcuadorDateTimeMs(delivery.date, delivery.time);
              const isPast = dtMs !== null && dtMs <= nowEc.epochMs;

              return (
                <div
                  key={delivery.id || idx}
                  className="rounded-xl border border-[#D4A353]/30 bg-[#0B182E] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-[#FAF4E8]/10">
                    <h3 className="font-display text-lg font-bold text-[#FAF4E8]">
                      Entrega {idx + 1}
                    </h3>
                    <span className="text-xs font-semibold tabular-nums text-[#D4A353]">
                      {deliverySum} {deliverySum === 1 ? 'pan asignado' : 'panes asignados'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label
                        htmlFor={`split-date-${idx}`}
                        className="block text-xs font-semibold text-[#FAF4E8]/85 mb-1.5"
                      >
                        Fecha de entrega
                      </label>
                      <input
                        id={`split-date-${idx}`}
                        type="date"
                        min={nowEc.date}
                        value={delivery.date}
                        onChange={(e) => onUpdateDeliveryField(idx, 'date', e.target.value)}
                        className="dark-picker w-full rounded-lg border border-[#D4A353]/35 bg-[#081222] px-3 py-2.5 text-sm text-[#FAF4E8] focus:border-[#D4A353] focus:outline-none tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`split-time-${idx}`}
                        className="block text-xs font-semibold text-[#FAF4E8]/85 mb-1.5"
                      >
                        Hora de entrega (Ecuador)
                      </label>
                      <input
                        id={`split-time-${idx}`}
                        type="time"
                        value={delivery.time}
                        onChange={(e) => onUpdateDeliveryField(idx, 'time', e.target.value)}
                        className="dark-picker w-full rounded-lg border border-[#D4A353]/35 bg-[#081222] px-3 py-2.5 text-sm text-[#FAF4E8] focus:border-[#D4A353] focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  {isPast && (
                    <p className="mb-3 text-xs font-medium text-red-300 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Este horario ya pasó en Ecuador. Elige una fecha u hora futura.
                    </p>
                  )}

                  {/* Per-SKU allocation inputs */}
                  <div className="divide-y divide-[#FAF4E8]/10">
                    {lineItems.map((line) => {
                      const assignedVal = Number(delivery.items?.[line.sku.key]) || 0;
                      const rem = remainingBySku[line.sku.key] ?? 0;

                      return (
                        <div
                          key={line.sku.key}
                          className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#FAF4E8]">
                              {line.sku.flavor} · {line.sku.weight}
                            </p>
                            <p className="text-xs text-[#FAF4E8]/65 tabular-nums">
                              Carrito: {line.quantity} ·{' '}
                              {rem > 0
                                ? `Faltan ${rem} por repartir`
                                : rem === 0
                                ? 'Repartido exacto'
                                : `Excede por ${Math.abs(rem)}`}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {rem > 0 && (
                              <button
                                type="button"
                                onClick={() => onAssignRemainingToDelivery(idx, line.sku.key)}
                                className="rounded-lg border border-[#D4A353]/40 bg-[#142A4C] px-2.5 py-1.5 text-xs font-medium text-[#FAF4E8] hover:bg-[#1C3A68] transition-colors whitespace-nowrap cursor-pointer"
                              >
                                +{rem} resto
                              </button>
                            )}
                            <div className="inline-flex items-center rounded-lg border border-[#D4A353]/35 bg-[#081222]">
                              <button
                                type="button"
                                aria-label={`Restar ${line.sku.flavor} ${line.sku.weight} en Entrega ${idx + 1}`}
                                onClick={() =>
                                  onUpdateDeliveryItemQty(
                                    idx,
                                    line.sku.key,
                                    Math.max(0, assignedVal - 1),
                                  )
                                }
                                className="flex h-10 w-10 items-center justify-center text-[#FAF4E8] hover:bg-[#152B4D] rounded-l-lg transition-colors cursor-pointer"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                aria-label={`Cantidad de ${line.sku.flavor} ${line.sku.weight} para Entrega ${idx + 1}`}
                                value={assignedVal}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^\d]/g, '');
                                  const parsed = raw === '' ? 0 : Number.parseInt(raw, 10);
                                  onUpdateDeliveryItemQty(idx, line.sku.key, parsed);
                                }}
                                className="w-14 bg-transparent text-center text-sm font-semibold text-[#FAF4E8] tabular-nums focus:outline-none"
                              />
                              <button
                                type="button"
                                aria-label={`Sumar ${line.sku.flavor} ${line.sku.weight} en Entrega ${idx + 1}`}
                                onClick={() =>
                                  onUpdateDeliveryItemQty(idx, line.sku.key, assignedVal + 1)
                                }
                                className="flex h-10 w-10 items-center justify-center text-[#FAF4E8] hover:bg-[#152B4D] rounded-r-lg transition-colors cursor-pointer"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chronological ordering preview */}
          <div className="rounded-xl border border-[#FAF4E8]/12 bg-[#081222] p-3.5 text-xs text-[#FAF4E8]/80">
            <p className="font-semibold text-[#D4A353] mb-1.5">
              Orden cronológico de tus entregas:
            </p>
            <ol className="space-y-1 list-decimal list-inside tabular-nums">
              {sortedPreview.map((item, pos) => (
                <li key={item.idx}>
                  {item.date ? formatEcuadorDateReadable(item.date) : 'Sin fecha'}{' '}
                  {item.time || '--:--'} · {item.total} {item.total === 1 ? 'pan' : 'panes'}
                  {pos === 0 ? ' (Primera entrega)' : ''}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
