import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNowEcuador } from './src/shared/catalog.ts';
import {
  validateOrderPayload,
  type OrderSubmissionPayload,
  type ValidatedOrder,
} from './src/shared/validation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IDEMPOTENCY_FILE = path.resolve(__dirname, '.pan-canela-idempotency.json');

interface ConfirmedOrderRecord {
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

const completedOrders = new Map<string, ConfirmedOrderRecord>();
const inFlightOrders = new Map<string, Promise<ConfirmedOrderRecord>>();

function loadIdempotencyStore() {
  try {
    if (fs.existsSync(IDEMPOTENCY_FILE)) {
      const raw = fs.readFileSync(IDEMPOTENCY_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ConfirmedOrderRecord>;
      for (const [k, v] of Object.entries(parsed)) {
        completedOrders.set(k, v);
      }
    }
  } catch (err) {
    console.warn('No se pudo cargar el caché de idempotencia:', err);
  }
}

function saveIdempotencyStore() {
  try {
    const obj: Record<string, ConfirmedOrderRecord> = {};
    for (const [k, v] of completedOrders.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(IDEMPOTENCY_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('No se pudo guardar el caché de idempotencia:', err);
  }
}

loadIdempotencyStore();

async function writeOrderViaAppsScript(
  validated: ValidatedOrder,
  rawPayload: OrderSubmissionPayload,
  appsScriptUrl: string,
): Promise<ConfirmedOrderRecord> {
  const secretToken = process.env.GOOGLE_APPS_SCRIPT_SECRET || '';
  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      ...rawPayload,
      secretToken,
    }),
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'No pudimos conectar con el registro de pedidos en este momento. Intenta nuevamente en unos segundos.',
    );
  }

  if (!response.ok || !data?.ok || !data?.orderCode) {
    throw new Error(
      data?.error || 'No se pudo confirmar el registro del pedido. Intenta nuevamente.',
    );
  }

  return {
    orderCode: String(data.orderCode),
    registeredAt: String(data.registeredAt || getNowEcuador().dateTimeDisplay),
    totalUsd: validated.totalUsdNumber,
    totalBreads: validated.totalBreads,
    firstDeliveryDate: validated.firstDeliveryDate,
    firstDeliveryTime: validated.firstDeliveryTime,
    splitDeliveries: validated.splitDeliveries,
    customerName: validated.customerName,
    detailText: validated.detailText,
    fillingsText: validated.fillingsText,
    scheduledDeliveriesText: validated.scheduledDeliveriesText,
  };
}

// Serialize concurrent writes to keep sequential PC-XXXX codes clean
let writeQueue: Promise<unknown> = Promise.resolve();
function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      ready: Boolean(process.env.GOOGLE_APPS_SCRIPT_URL?.trim()),
      ecuadorNow: getNowEcuador(),
    });
  });

  // Validate & register wholesale order through server-side Google Apps Script only
  app.post('/api/orders', async (req: Request, res: Response) => {
    const payload = req.body as OrderSubmissionPayload;
    const validation = validateOrderPayload(payload, new Date());

    if (!validation.valid || !validation.validated) {
      res.status(400).json({
        ok: false,
        errors: validation.errors,
        error: validation.errors[0] || 'Revisa los datos del pedido.',
      });
      return;
    }

    const validated = validation.validated;
    const key = validated.idempotencyKey;

    // 1. Return already-confirmed order on duplicate retry
    const alreadyDone = completedOrders.get(key);
    if (alreadyDone) {
      res.json({
        ok: true,
        duplicate: true,
        order: alreadyDone,
      });
      return;
    }

    // 2. Coalesce concurrent double-click submissions
    const existingPromise = inFlightOrders.get(key);
    if (existingPromise) {
      try {
        const order = await existingPromise;
        res.json({ ok: true, duplicate: true, order });
      } catch (err: any) {
        res.status(502).json({
          ok: false,
          error:
            err?.message ||
            'No pudimos confirmar tu pedido. Conservamos tus datos para que puedas reintentar.',
        });
      }
      return;
    }

    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim() || '';
    if (!appsScriptUrl) {
      res.status(503).json({
        ok: false,
        error:
          'El servicio de registro de pedidos no está disponible en este momento. Intenta más tarde.',
      });
      return;
    }

    const execution = runSerialized(() =>
      writeOrderViaAppsScript(validated, payload, appsScriptUrl),
    );
    inFlightOrders.set(key, execution);

    try {
      const confirmed = await execution;
      completedOrders.set(key, confirmed);
      saveIdempotencyStore();
      res.json({ ok: true, order: confirmed });
    } catch (err: any) {
      res.status(502).json({
        ok: false,
        error:
          err?.message ||
          'No pudimos confirmar el registro del pedido. Conservamos tu formulario para que puedas reintentar.',
      });
    } finally {
      inFlightOrders.delete(key);
    }
  });

  // Mount Vite in development, or serve static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pan & Canela server listening on http://localhost:${PORT}`);
  });
}

startServer();
