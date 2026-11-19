import { CheckCircle2, Loader2, X } from 'lucide-react';
import { formatCentsUSD, formatEcuadorDateReadable } from '../shared/catalog.ts';
import type { ValidatedOrder } from '../shared/validation.ts';

interface ConfirmOrderModalProps {
  open: boolean;
  order: ValidatedOrder | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmOrderModal({
  open,
  order,
  isSubmitting,
  onCancel,
  onConfirm,
}: ConfirmOrderModalProps) {
  if (!open || !order) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-order-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[#D4A353]/45 bg-[#0F1F38] p-6 text-[#FAF4E8] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#FAF4E8]/12 pb-4">
          <div>
            <h3 id="confirm-order-title" className="font-display text-2xl font-bold text-[#FAF4E8]">
              Confirmar tu pedido mayorista
            </h3>
            <p className="mt-1 text-xs text-[#FAF4E8]/75">
              Revisa los datos antes de registrar tu pedido oficial en Pan &amp; Canela.
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            aria-label="Cerrar confirmación"
            className="rounded-lg p-1.5 text-[#FAF4E8]/70 hover:bg-[#193259] hover:text-[#FAF4E8] disabled:opacity-40 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#0A1629] p-3.5 border border-[#FAF4E8]/10">
            <div>
              <span className="block text-xs text-[#FAF4E8]/60">Cliente</span>
              <span className="font-semibold text-[#FAF4E8]">{order.customerName}</span>
            </div>
            <div className="text-right">
              <span className="block text-xs text-[#FAF4E8]/60">Total del pedido</span>
              <span className="font-display text-lg font-bold text-[#D4A353] tabular-nums">
                {formatCentsUSD(order.totalCents)}
              </span>
            </div>
            <div>
              <span className="block text-xs text-[#FAF4E8]/60">Cantidad total</span>
              <span className="font-medium tabular-nums">{order.totalBreads} panes</span>
            </div>
            <div className="text-right">
              <span className="block text-xs text-[#FAF4E8]/60">Primera entrega</span>
              <span className="font-medium tabular-nums">
                {formatEcuadorDateReadable(order.firstDeliveryDate)} · {order.firstDeliveryTime}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#FAF4E8]/70 mb-1.5">Detalle de productos</p>
            <ul className="space-y-1 rounded-xl bg-[#0A1629] p-3 border border-[#FAF4E8]/10 text-xs tabular-nums">
              {order.lineItems.map((line) => (
                <li key={line.sku.key} className="flex items-center justify-between gap-2">
                  <span>
                    {line.quantity}x {line.sku.flavor} {line.sku.weight} ({formatCentsUSD(line.sku.wholesaleCents)})
                  </span>
                  <span className="font-semibold text-[#FAF4E8]">
                    {formatCentsUSD(line.subtotalCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {order.sortedDeliveries.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-[#FAF4E8]/70 mb-1.5">
                Entregas programadas ({order.sortedDeliveries.length} fechas)
              </p>
              <div className="space-y-1.5 rounded-xl bg-[#0A1629] p-3 border border-[#FAF4E8]/10 text-xs tabular-nums">
                {order.sortedDeliveries.map((d, i) => (
                  <div key={`${d.date}-${d.time}`}>
                    <span className="font-semibold text-[#D4A353]">
                      {i + 1}. {formatEcuadorDateReadable(d.date)} {d.time}:
                    </span>{' '}
                    {d.items.map((it) => `${it.quantity}x ${it.sku.flavor} ${it.sku.weight}`).join(', ')}{' '}
                    ({d.totalBreads} panes)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-[#FAF4E8]/25 bg-transparent px-5 py-2.5 text-sm font-semibold text-[#FAF4E8] hover:bg-[#193259] disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#9E2A2B] px-5 py-2.5 text-sm font-semibold text-[#FAF4E8] hover:bg-[#B23233] disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Registrando pedido...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirmar y registrar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
