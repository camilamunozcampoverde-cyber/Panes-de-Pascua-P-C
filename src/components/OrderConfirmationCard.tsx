import { CheckCircle2, PlusCircle } from 'lucide-react';
import { formatEcuadorDateReadable } from '../shared/catalog.ts';

export interface ConfirmedOrderReceipt {
  orderCode: string;
  registeredAt: string;
  totalUsd: number;
  totalBreads: number;
  firstDeliveryDate: string;
  firstDeliveryTime: string;
  splitDeliveries: boolean;
  customerName: string;
  detailText: string;
  fillingsText: string;
  scheduledDeliveriesText: string;
}

interface OrderConfirmationCardProps {
  receipt: ConfirmedOrderReceipt;
  onStartNewOrder: () => void;
}

export function OrderConfirmationCard({
  receipt,
  onStartNewOrder,
}: OrderConfirmationCardProps) {
  return (
    <section
      aria-live="polite"
      className="mx-auto max-w-2xl rounded-2xl border border-[#D4A353]/50 bg-[#0F1F38]/95 p-6 sm:p-8 shadow-2xl text-[#FAF4E8]"
    >
      <div className="flex flex-col items-center text-center border-b border-[#FAF4E8]/12 pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-400/15 border border-sky-300/45 text-sky-200 mb-4">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#FAF4E8]">
          Recibimos tu pedido
        </h2>
        <p className="mt-2 text-sm text-[#FAF4E8]/80 max-w-md">
          Tu pedido mayorista quedó confirmado y registrado en Pan &amp; Canela. Guarda tu código de orden como comprobante.
        </p>

        <div className="mt-5 rounded-xl border border-[#D4A353]/50 bg-[#0A1629] px-6 py-3">
          <span className="block text-xs text-[#FAF4E8]/65">Código de orden</span>
          <span className="font-display text-3xl font-bold tracking-wider text-[#D4A353] tabular-nums">
            {receipt.orderCode}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-[#0A1629] p-4 border border-[#FAF4E8]/10">
          <div>
            <span className="block text-xs text-[#FAF4E8]/60">Cliente</span>
            <span className="font-semibold">{receipt.customerName}</span>
          </div>
          <div>
            <span className="block text-xs text-[#FAF4E8]/60">Fecha de registro (Ecuador)</span>
            <span className="font-medium tabular-nums">{receipt.registeredAt}</span>
          </div>
          <div>
            <span className="block text-xs text-[#FAF4E8]/60">Primera entrega</span>
            <span className="font-medium tabular-nums">
              {formatEcuadorDateReadable(receipt.firstDeliveryDate)} · {receipt.firstDeliveryTime}
            </span>
          </div>
          <div>
            <span className="block text-xs text-[#FAF4E8]/60">Total confirmado</span>
            <span className="font-display text-lg font-bold text-[#D4A353] tabular-nums">
              ${receipt.totalUsd.toFixed(2)} USD ({receipt.totalBreads} panes)
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-[#0A1629] p-4 border border-[#FAF4E8]/10">
          <p className="text-xs font-semibold text-[#D4A353] mb-2">Detalle registrado</p>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#FAF4E8]/90 tabular-nums">
            {receipt.detailText}
          </pre>
        </div>

        {receipt.scheduledDeliveriesText && (
          <div className="rounded-xl bg-[#0A1629] p-4 border border-[#FAF4E8]/10">
            <p className="text-xs font-semibold text-[#D4A353] mb-2">Entregas programadas</p>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#FAF4E8]/90 tabular-nums">
              {receipt.scheduledDeliveriesText}
            </pre>
          </div>
        )}
      </div>

      <div className="mt-7 flex items-center justify-center">
        <button
          type="button"
          onClick={onStartNewOrder}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#9E2A2B] px-6 py-2.5 text-sm font-semibold text-[#FAF4E8] hover:bg-[#B23233] transition-colors cursor-pointer"
        >
          <PlusCircle className="h-4 w-4" />
          Registrar otro pedido
        </button>
      </div>
    </section>
  );
}
