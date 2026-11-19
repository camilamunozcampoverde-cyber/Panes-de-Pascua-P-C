import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CATALOG,
  FLAVORS,
  SPLIT_DELIVERY_MIN_BREADS,
  WHOLESALE_MIN_BREADS,
  addDaysEcuador,
  formatCentsUSD,
  getNowEcuador,
  type FlavorId,
  type SkuKey,
  type WeightId,
} from './shared/catalog.ts';
import {
  computeCartSummary,
  createEmptyCart,
  validateOrderPayload,
  type CartQuantities,
  type DeliveryAllocationInput,
  type OrderSubmissionPayload,
} from './shared/validation.ts';
import { PanDePascua3D } from './components/PanDePascua3D.tsx';
import { DeliveryScheduler } from './components/DeliveryScheduler.tsx';
import { ConfirmOrderModal } from './components/ConfirmOrderModal.tsx';
import {
  OrderConfirmationCard,
  type ConfirmedOrderReceipt,
} from './components/OrderConfirmationCard.tsx';

function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function createDefaultDeliveries(count: 1 | 2 | 3): DeliveryAllocationInput[] {
  const todayEc = getNowEcuador().date;
  return Array.from({ length: count }, (_, idx) => ({
    id: makeUuid(),
    date: addDaysEcuador(todayEc, idx + 1),
    time: '10:00',
    items: {},
  }));
}

export default function App() {
  const [activeFlavor, setActiveFlavor] = useState<FlavorId>('Tradicional');
  const [selected3DWeight, setSelected3DWeight] = useState<WeightId>('500 g');
  const [cart, setCart] = useState<CartQuantities>(() => createEmptyCart());
  const [customerName, setCustomerName] = useState('');
  const [splitDeliveries, setSplitDeliveries] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryAllocationInput[]>(() =>
    createDefaultDeliveries(1),
  );

  // Idempotency key resets when form content changes, stays constant on retry
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeUuid());

  // Submission & confirmation state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState<ConfirmedOrderReceipt | null>(null);
  const submitLockRef = useRef(false);

  const summary = useMemo(() => computeCartSummary(cart), [cart]);

  // If total drops below 50, disable split deliveries automatically
  useEffect(() => {
    if (summary.totalBreads < SPLIT_DELIVERY_MIN_BREADS && splitDeliveries) {
      setSplitDeliveries(false);
      setDeliveries((prev) => [
        {
          id: prev[0]?.id || makeUuid(),
          date: prev[0]?.date || addDaysEcuador(getNowEcuador().date, 1),
          time: prev[0]?.time || '10:00',
          items: {},
        },
      ]);
    }
  }, [summary.totalBreads, splitDeliveries]);

  const currentPayload: OrderSubmissionPayload = useMemo(
    () => ({
      idempotencyKey,
      customerName,
      quantities: cart,
      splitDeliveries: splitDeliveries && summary.totalBreads >= SPLIT_DELIVERY_MIN_BREADS,
      deliveries,
    }),
    [idempotencyKey, customerName, cart, splitDeliveries, summary.totalBreads, deliveries],
  );

  const liveValidation = useMemo(
    () => validateOrderPayload(currentPayload),
    [currentPayload],
  );

  const markDraftEdited = () => {
    setIdempotencyKey(makeUuid());
    setSubmitError(null);
  };

  const handleSetSkuQty = (key: SkuKey, nextQty: number, weight: WeightId) => {
    const clean = Number.isFinite(nextQty) && nextQty >= 0 ? Math.floor(nextQty) : 0;
    setSelected3DWeight(weight);
    setCart((prev) => {
      if (prev[key] === clean) return prev;
      return { ...prev, [key]: clean };
    });
    markDraftEdited();
  };

  const handleClearCart = () => {
    setCart(createEmptyCart());
    setSplitDeliveries(false);
    setDeliveries(createDefaultDeliveries(1));
    markDraftEdited();
  };

  const handleToggleSplitDeliveries = (enabled: boolean) => {
    if (enabled && summary.totalBreads < SPLIT_DELIVERY_MIN_BREADS) return;
    setSplitDeliveries(enabled);
    if (enabled) {
      const baseDate = deliveries[0]?.date || addDaysEcuador(getNowEcuador().date, 1);
      const secondDate = addDaysEcuador(baseDate, 2);
      setDeliveries([
        {
          id: makeUuid(),
          date: baseDate,
          time: deliveries[0]?.time || '10:00',
          items: {},
        },
        {
          id: makeUuid(),
          date: secondDate,
          time: '10:00',
          items: {},
        },
      ]);
    } else {
      setDeliveries([
        {
          id: makeUuid(),
          date: deliveries[0]?.date || addDaysEcuador(getNowEcuador().date, 1),
          time: deliveries[0]?.time || '10:00',
          items: {},
        },
      ]);
    }
    markDraftEdited();
  };

  const handleDeliveryCountChange = (count: 2 | 3) => {
    setDeliveries((prev) => {
      if (prev.length === count) return prev;
      if (count < prev.length) {
        return prev.slice(0, count);
      }
      const lastDate = prev[prev.length - 1]?.date || addDaysEcuador(getNowEcuador().date, 1);
      const added: DeliveryAllocationInput = {
        id: makeUuid(),
        date: addDaysEcuador(lastDate, 2),
        time: '10:00',
        items: {},
      };
      return [...prev, added];
    });
    markDraftEdited();
  };

  const handleUpdateDeliveryField = (index: number, field: 'date' | 'time', value: string) => {
    setDeliveries((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)),
    );
    markDraftEdited();
  };

  const handleUpdateDeliveryItemQty = (index: number, skuKey: SkuKey, qty: number) => {
    const clean = Number.isFinite(qty) && qty >= 0 ? Math.floor(qty) : 0;
    setDeliveries((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              items: {
                ...d.items,
                [skuKey]: clean,
              },
            }
          : d,
      ),
    );
    markDraftEdited();
  };

  const handleAssignRemainingToDelivery = (index: number, skuKey: SkuKey) => {
    const cartQty = cart[skuKey] || 0;
    const assignedElsewhere = deliveries.reduce(
      (sum, d, i) => (i === index ? sum : sum + (Number(d.items?.[skuKey]) || 0)),
      0,
    );
    const targetVal = Math.max(0, cartQty - assignedElsewhere);
    handleUpdateDeliveryItemQty(index, skuKey, targetVal);
  };

  const handleRequestSubmit = () => {
    setSubmitError(null);
    if (!liveValidation.valid || !liveValidation.validated) {
      setSubmitError(liveValidation.errors[0] || 'Completa todos los campos requeridos.');
      return;
    }
    setConfirmModalOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (submitLockRef.current || isSubmitting) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPayload),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.order?.orderCode) {
        throw new Error(
          data?.error ||
            'No pudimos confirmar tu pedido en este momento. Conservamos tu formulario para que puedas reintentar.',
        );
      }

      setConfirmModalOpen(false);
      setConfirmedReceipt(data.order as ConfirmedOrderReceipt);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setConfirmModalOpen(false);
      setSubmitError(
        err?.message ||
          'Error de conexión al registrar tu pedido. Conservamos tus datos para que puedas reintentar.',
      );
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleStartNewOrder = () => {
    setConfirmedReceipt(null);
    setCart(createEmptyCart());
    setCustomerName('');
    setSplitDeliveries(false);
    setDeliveries(createDefaultDeliveries(1));
    setSubmitError(null);
    setIdempotencyKey(makeUuid());
  };

  const activeFlavorInfo = FLAVORS.find((f) => f.id === activeFlavor) ?? FLAVORS[0];
  const activeProducts = CATALOG.filter((item) => item.flavor === activeFlavor);

  const countByFlavor: Record<FlavorId, number> = useMemo(() => {
    const counts: Record<FlavorId, number> = { Tradicional: 0, Nutella: 0, Higos: 0 };
    for (const item of CATALOG) {
      counts[item.flavor] += cart[item.key] || 0;
    }
    return counts;
  }, [cart]);

  const canClickRegister =
    summary.totalBreads >= WHOLESALE_MIN_BREADS && liveValidation.valid && !isSubmitting;

  return (
    <div className="relative min-h-screen text-[#FAF4E8]">
      {/* Fixed Festive Background (Christmas tree bokeh + wooden table) */}
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url("/assets/aistudio/image_c2bcee86.png")' }}
        aria-hidden="true"
      />
      {/* Soft Christmas midnight blue scrim for WCAG AA legibility */}
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-b from-[#07101E]/85 via-[#0B172A]/82 to-[#120E0D]/86"
        aria-hidden="true"
      />

      {/* Top Bar — Clean 3-zone customer navigation (no admin or Sheets access) */}
      <header className="sticky top-0 z-30 border-b border-[#D4A353]/25 bg-[#091426]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          <a
            href="#inicio"
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#FAF4E8] whitespace-nowrap shrink-0"
          >
            Pan &amp; Canela
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#FAF4E8]/80">
            <a
              href="#catalogo"
              className="hover:text-[#D4A353] transition-colors whitespace-nowrap shrink-0"
            >
              Catálogo
            </a>
            <a
              href="#entrega"
              className="hover:text-[#D4A353] transition-colors whitespace-nowrap shrink-0"
            >
              Entrega
            </a>
            <a
              href="#resumen"
              className="hover:text-[#D4A353] transition-colors whitespace-nowrap shrink-0"
            >
              Resumen
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <a
              href="#resumen"
              className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-[#D4A353]/50 bg-[#142744] px-3.5 py-2 text-xs font-semibold text-[#FAF4E8] hover:bg-[#1C365E] transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              <ShoppingBag className="h-4 w-4 text-[#D4A353]" />
              <span>Mi pedido ({summary.totalBreads})</span>
            </a>
          </div>
        </div>
      </header>

      <main id="inicio" className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-20">
        {/* Hero Header */}
        <section className="mb-8 text-center max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-wider text-[#D4A353] mb-2">
            Panadería familiar · Machala, Ecuador
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#FAF4E8] [text-wrap:balance]">
            Pan &amp; Canela | Panes de Pascua al por mayor
          </h1>
          <p className="mt-3 text-base sm:text-lg text-[#FAF4E8]/90 font-medium [text-wrap:balance]">
            Precio mayorista desde 20 panes. Puedes combinar sabores y tamaños
          </p>
        </section>

        {confirmedReceipt ? (
          <OrderConfirmationCard
            receipt={confirmedReceipt}
            onStartNewOrder={handleStartNewOrder}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
            {/* LEFT COLUMN: Catalog Tabs + Product Cards + Delivery Form */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-7">
              {/* Catalog Section */}
              <section
                id="catalogo"
                aria-labelledby="flavor-section-heading"
                className="rounded-2xl border border-[#D4A353]/35 bg-[#0F1F38]/94 p-5 sm:p-6 shadow-xl"
              >
                {/* Three Flavor Tabs */}
                <div
                  role="tablist"
                  aria-label="Sabores de Pan de Pascua"
                  className="grid grid-cols-3 gap-2 rounded-xl bg-[#091426] p-1.5 border border-[#FAF4E8]/10"
                >
                  {FLAVORS.map((flavor) => {
                    const isActive = activeFlavor === flavor.id;
                    const qtyCount = countByFlavor[flavor.id];
                    return (
                      <button
                        key={flavor.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveFlavor(flavor.id)}
                        className={`min-h-[44px] rounded-lg px-2 sm:px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          isActive
                            ? 'bg-[#9E2A2B] text-[#FAF4E8] shadow-md'
                            : 'text-[#FAF4E8]/80 hover:bg-[#162C4F] hover:text-[#FAF4E8]'
                        }`}
                      >
                        <span>{flavor.tabLabel}</span>
                        {qtyCount > 0 && (
                          <span className="ml-1.5 text-xs font-bold tabular-nums opacity-90">
                            · {qtyCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Active Flavor Title + Visual Reference Strip */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                  <div className="md:col-span-7 flex flex-col justify-between">
                    <div>
                      <h2
                        id="flavor-section-heading"
                        className="font-display text-2xl sm:text-3xl font-bold text-[#FAF4E8] tracking-tight"
                      >
                        {activeFlavorInfo.sectionTitle}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[#FAF4E8]/80">
                        {activeFlavorInfo.shortDescription}
                      </p>
                    </div>

                    {/* Visual reference thumbnail from attached classic Pan de Pascua photo */}
                    <div className="mt-4 flex items-center gap-3.5 rounded-xl border border-[#D4A353]/25 bg-[#0A1629] p-2.5">
                      <img
                        src="/assets/aistudio/image_16fd6680.png"
                        alt="Referencia artesanal de Pan de Pascua Clásico Pan & Canela"
                        referrerPolicy="no-referrer"
                        className="h-16 w-16 rounded-lg object-cover shrink-0 border border-[#D4A353]/30"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#D4A353]">
                          Horneado fresco bajo pedido en Machala
                        </p>
                        <p className="text-xs text-[#FAF4E8]/75 mt-0.5">
                          Presentación navideña artesanal. Conserva tus cantidades al cambiar de sabor.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Three.js 3D Preview */}
                  <div className="md:col-span-5">
                    <PanDePascua3D
                      flavor={activeFlavor}
                      selectedWeight={selected3DWeight}
                      onSelectWeight={setSelected3DWeight}
                    />
                  </div>
                </div>

                {/* 3 Weight Option Cards (500 g, 250 g, 100 g) */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {activeProducts.map((product) => {
                    const qty = cart[product.key] || 0;
                    const lineSubtotalCents = qty * product.wholesaleCents;
                    const isSelectedWeight = selected3DWeight === product.weight;

                    return (
                      <article
                        key={product.key}
                        onClick={() => setSelected3DWeight(product.weight)}
                        className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                          qty > 0
                            ? 'border-[#D4A353] bg-[#162C4F]'
                            : isSelectedWeight
                            ? 'border-[#D4A353]/55 bg-[#10223E]'
                            : 'border-[#FAF4E8]/15 bg-[#0B182E] hover:border-[#D4A353]/40'
                        }`}
                      >
                        <div>
                          {/* Weight Heading */}
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="font-display text-2xl font-bold text-[#FAF4E8] tabular-nums">
                              {product.weight}
                            </h3>
                            <span className="text-xs text-[#FAF4E8]/60 line-through tabular-nums">
                              {formatCentsUSD(product.regularCents)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#FAF4E8]/75 leading-snug">
                            {product.subtitle}
                          </p>

                          {/* Festive Crimson Wholesale Price Ribbon */}
                          <div className="mt-4 relative overflow-hidden rounded-lg bg-[#9E2A2B] px-3 py-2.5 text-center border border-[#D4A353]/45 shadow-sm">
                            <span className="block text-[11px] font-medium text-[#FAF4E8]/85">
                              Precio mayorista
                            </span>
                            <span className="font-display text-2xl font-bold text-[#FAF4E8] tabular-nums">
                              {formatCentsUSD(product.wholesaleCents)}
                            </span>
                          </div>
                        </div>

                        {/* Quantity Stepper + Direct Input */}
                        <div className="mt-4 pt-3 border-t border-[#FAF4E8]/10">
                          <label htmlFor={`qty-${product.key}`} className="sr-only">
                            Cantidad de {product.flavor} {product.weight}
                          </label>
                          <div className="flex items-center justify-between rounded-xl border border-[#D4A353]/40 bg-[#081222]">
                            <button
                              type="button"
                              aria-label={`Disminuir ${product.flavor} ${product.weight}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetSkuQty(product.key, Math.max(0, qty - 1), product.weight);
                              }}
                              className="flex h-11 w-11 items-center justify-center text-[#FAF4E8] hover:bg-[#173056] rounded-l-xl transition-colors cursor-pointer"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <input
                              id={`qty-${product.key}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={qty}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^\d]/g, '');
                                const parsed = cleaned === '' ? 0 : Number.parseInt(cleaned, 10);
                                handleSetSkuQty(product.key, parsed, product.weight);
                              }}
                              className="w-full min-w-0 bg-transparent text-center text-base font-bold text-[#FAF4E8] tabular-nums focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label={`Aumentar ${product.flavor} ${product.weight}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetSkuQty(product.key, qty + 1, product.weight);
                              }}
                              className="flex h-11 w-11 items-center justify-center text-[#FAF4E8] hover:bg-[#173056] rounded-r-xl transition-colors cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-xs tabular-nums">
                            <span className="text-[#FAF4E8]/65">Subtotal</span>
                            <span
                              className={`font-semibold ${
                                qty > 0 ? 'text-[#D4A353]' : 'text-[#FAF4E8]/50'
                              }`}
                            >
                              {formatCentsUSD(lineSubtotalCents)}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* Customer Data & Delivery Section */}
              <div id="entrega">
                <DeliveryScheduler
                  customerName={customerName}
                  onCustomerNameChange={(val) => {
                    setCustomerName(val);
                    markDraftEdited();
                  }}
                  totalBreads={summary.totalBreads}
                  lineItems={summary.lineItems}
                  splitDeliveries={splitDeliveries}
                  onToggleSplitDeliveries={handleToggleSplitDeliveries}
                  deliveries={deliveries}
                  onDeliveryCountChange={handleDeliveryCountChange}
                  onUpdateDeliveryField={handleUpdateDeliveryField}
                  onUpdateDeliveryItemQty={handleUpdateDeliveryItemQty}
                  onAssignRemainingToDelivery={handleAssignRemainingToDelivery}
                />
              </div>
            </div>

            {/* RIGHT COLUMN: Sticky Real-Time Order Summary */}
            <aside
              id="resumen"
              aria-labelledby="resumen-heading"
              className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20"
            >
              <div className="rounded-2xl border border-[#D4A353]/40 bg-[#0F1F38]/95 p-5 sm:p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-2 border-b border-[#FAF4E8]/12 pb-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-[#D4A353]" />
                    <h2
                      id="resumen-heading"
                      className="font-display text-2xl font-bold text-[#FAF4E8]"
                    >
                      Resumen del pedido
                    </h2>
                  </div>
                  {summary.totalBreads > 0 && (
                    <button
                      type="button"
                      onClick={handleClearCart}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#FAF4E8]/65 hover:text-red-300 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Progress toward 20-bread wholesale minimum */}
                <div className="mt-4 rounded-xl border border-[#FAF4E8]/12 bg-[#0A1629] p-3.5">
                  <div className="flex items-center justify-between text-xs font-semibold tabular-nums mb-2">
                    <span className="text-[#FAF4E8]/85">Total de panes</span>
                    <span className="text-[#D4A353]">
                      {summary.totalBreads} / {WHOLESALE_MIN_BREADS} mínimo
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#192F52]">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        summary.missingForMin === 0 ? 'bg-sky-400' : 'bg-[#D4A353]'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((summary.totalBreads / WHOLESALE_MIN_BREADS) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                  {summary.missingForMin > 0 ? (
                    <p className="mt-2 text-xs font-medium text-amber-200 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                      {summary.missingForMin === 1
                        ? 'Te falta 1 pan para alcanzar el mínimo mayorista de 20 panes.'
                        : `Te faltan ${summary.missingForMin} panes para alcanzar el mínimo mayorista de 20 panes.`}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-sky-200 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                      {summary.canSplitDeliveries
                        ? 'Mínimo mayorista cumplido · Puedes dividir en 2 o 3 fechas.'
                        : 'Mínimo mayorista cumplido · Listo para agendar entrega.'}
                    </p>
                  )}
                </div>

                {/* Itemized list */}
                <div className="mt-4">
                  {summary.lineItems.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[#FAF4E8]/60">
                      Agrega tus panes de Pascua desde las pestañas Tradicional, Nutella o Higos.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#FAF4E8]/10 text-sm">
                      {summary.lineItems.map((line) => (
                        <li
                          key={line.sku.key}
                          className="flex items-start justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#FAF4E8]">
                              {line.sku.flavor} · {line.sku.weight}
                            </p>
                            <p className="text-xs text-[#FAF4E8]/65 tabular-nums">
                              {line.quantity} × {formatCentsUSD(line.sku.wholesaleCents)}
                            </p>
                          </div>
                          <span className="font-semibold text-[#FAF4E8] tabular-nums whitespace-nowrap">
                            {formatCentsUSD(line.subtotalCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Totals */}
                <div className="mt-4 border-t border-[#D4A353]/25 pt-4 space-y-2 text-sm tabular-nums">
                  <div className="flex items-center justify-between text-[#FAF4E8]/80">
                    <span>Número total de panes</span>
                    <span className="font-semibold text-[#FAF4E8]">{summary.totalBreads}</span>
                  </div>
                  {summary.savingsCents > 0 && (
                    <div className="flex items-center justify-between text-sky-300 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        Ahorro mayorista frente a precio regular
                      </span>
                      <span className="font-semibold">
                        −{formatCentsUSD(summary.savingsCents)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between pt-2 border-t border-[#FAF4E8]/10">
                    <span className="font-display text-lg font-bold text-[#FAF4E8]">
                      Total (USD)
                    </span>
                    <span className="font-display text-3xl font-bold text-[#D4A353]">
                      {formatCentsUSD(summary.totalCents)}
                    </span>
                  </div>
                </div>

                {/* Live Validation Checklist when >= 20 breads but form incomplete */}
                {summary.totalBreads >= WHOLESALE_MIN_BREADS && !liveValidation.valid && (
                  <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-950/35 p-3 text-xs text-amber-100 space-y-1">
                    <p className="font-semibold text-amber-200">Antes de registrar:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {liveValidation.errors.slice(0, 4).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Submission Failure Banner (preserves form & allows immediate retry) */}
                {submitError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-red-400/45 bg-red-950/55 p-3.5 text-xs text-red-100 space-y-2"
                  >
                    <p className="flex items-start gap-2 font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-300 mt-0.5" />
                      <span>{submitError}</span>
                    </p>
                    <button
                      type="button"
                      onClick={handleRequestSubmit}
                      className="rounded-lg bg-red-800/70 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                    >
                      Reintentar envío
                    </button>
                  </div>
                )}

                {/* Primary Submit CTA */}
                <button
                  type="button"
                  disabled={!canClickRegister}
                  onClick={handleRequestSubmit}
                  className="mt-5 w-full min-h-[48px] rounded-xl bg-[#9E2A2B] px-5 py-3 text-base font-bold text-[#FAF4E8] shadow-lg transition-colors hover:bg-[#B23233] disabled:cursor-not-allowed disabled:bg-[#232D42] disabled:text-[#FAF4E8]/45 cursor-pointer"
                >
                  Registrar pedido
                </button>

                <p className="mt-3 text-center text-[11px] text-[#FAF4E8]/65">
                  Recibirás tu código de orden al confirmarse el registro.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t border-[#FAF4E8]/10 bg-[#08111F]/92 py-6 text-center text-xs text-[#FAF4E8]/65">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Pan &amp; Canela · Panadería familiar en Machala, Ecuador</span>
          <span>Pedidos mayoristas de Panes de Pascua · Hora local America/Guayaquil</span>
        </div>
      </footer>

      {/* Order Confirmation Dialog before submitting */}
      <ConfirmOrderModal
        open={confirmModalOpen}
        order={liveValidation.validated ?? null}
        isSubmitting={isSubmitting}
        onCancel={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmSubmit}
      />
    </div>
  );
}
