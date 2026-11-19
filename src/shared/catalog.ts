export type FlavorId = 'Tradicional' | 'Nutella' | 'Higos';
export type WeightId = '500 g' | '250 g' | '100 g';

export type SkuKey = `${FlavorId}|${WeightId}`;

export interface FlavorInfo {
  id: FlavorId;
  tabLabel: string;
  sectionTitle: string;
  shortDescription: string;
  fillingNote: string;
  accentHex: string;
}

export interface ProductSku {
  key: SkuKey;
  flavor: FlavorId;
  weight: WeightId;
  weightGrams: number;
  regularCents: number;
  wholesaleCents: number;
  subtitle: string;
}

export const WHOLESALE_MIN_BREADS = 20;
export const SPLIT_DELIVERY_MIN_BREADS = 50;
export const MAX_SPLIT_DATES = 3;
export const ECUADOR_TIMEZONE = 'America/Guayaquil';

export const FLAVORS: readonly FlavorInfo[] = [
  {
    id: 'Tradicional',
    tabLabel: 'Tradicional',
    sectionTitle: 'Pan de Pascua Clásico',
    shortDescription: 'Receta familiar especiada con fruta confitada, pasas maceradas y esencia de canela.',
    fillingNote: 'de pan de pascua con fruta confitada',
    accentHex: '#C89B3C',
  },
  {
    id: 'Nutella',
    tabLabel: 'Nutella',
    sectionTitle: 'Pan de Pascua de Nutella',
    shortDescription: 'Miga suave de especias navideñas rellena generosamente con crema de avellanas Nutella.',
    fillingNote: 'de pan de pascua relleno de Nutella',
    accentHex: '#8C4A27',
  },
  {
    id: 'Higos',
    tabLabel: 'Higos',
    sectionTitle: 'Pan de Pascua de Higos',
    shortDescription: 'Higos tiernos en almíbar de panela y especias horneados dentro de nuestra masa artesanal.',
    fillingNote: 'de pan de pascua con higos en almíbar',
    accentHex: '#6E3B59',
  },
] as const;

export const WEIGHTS: readonly WeightId[] = ['500 g', '250 g', '100 g'] as const;

export const CATALOG: readonly ProductSku[] = [
  // Tradicional
  {
    key: 'Tradicional|500 g',
    flavor: 'Tradicional',
    weight: '500 g',
    weightGrams: 500,
    regularCents: 350,
    wholesaleCents: 290,
    subtitle: 'de pan de pascua con fruta confitada',
  },
  {
    key: 'Tradicional|250 g',
    flavor: 'Tradicional',
    weight: '250 g',
    weightGrams: 250,
    regularCents: 200,
    wholesaleCents: 170,
    subtitle: 'de pan de pascua con fruta confitada',
  },
  {
    key: 'Tradicional|100 g',
    flavor: 'Tradicional',
    weight: '100 g',
    weightGrams: 100,
    regularCents: 100,
    wholesaleCents: 85,
    subtitle: 'de pan de pascua con fruta confitada',
  },
  // Nutella
  {
    key: 'Nutella|500 g',
    flavor: 'Nutella',
    weight: '500 g',
    weightGrams: 500,
    regularCents: 650,
    wholesaleCents: 600,
    subtitle: 'de pan de pascua relleno de Nutella',
  },
  {
    key: 'Nutella|250 g',
    flavor: 'Nutella',
    weight: '250 g',
    weightGrams: 250,
    regularCents: 400,
    wholesaleCents: 350,
    subtitle: 'de pan de pascua relleno de Nutella',
  },
  {
    key: 'Nutella|100 g',
    flavor: 'Nutella',
    weight: '100 g',
    weightGrams: 100,
    regularCents: 200,
    wholesaleCents: 150,
    subtitle: 'de pan de pascua relleno de Nutella',
  },
  // Higos
  {
    key: 'Higos|500 g',
    flavor: 'Higos',
    weight: '500 g',
    weightGrams: 500,
    regularCents: 500,
    wholesaleCents: 440,
    subtitle: 'de pan de pascua con higos en almíbar',
  },
  {
    key: 'Higos|250 g',
    flavor: 'Higos',
    weight: '250 g',
    weightGrams: 250,
    regularCents: 325,
    wholesaleCents: 260,
    subtitle: 'de pan de pascua con higos en almíbar',
  },
  {
    key: 'Higos|100 g',
    flavor: 'Higos',
    weight: '100 g',
    weightGrams: 100,
    regularCents: 140,
    wholesaleCents: 100,
    subtitle: 'de pan de pascua con higos en almíbar',
  },
] as const;

export const CATALOG_BY_KEY: Record<SkuKey, ProductSku> = CATALOG.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<SkuKey, ProductSku>,
);

export const SHEETS_HEADERS = [
  'Orden',
  'Fecha Registro',
  'Cliente',
  'Fecha Entrega',
  'Hora',
  'Detalle',
  'Rellenos',
  'Entregas programadas',
  'Total',
  'Anotado',
] as const;

export function makeSkuKey(flavor: FlavorId, weight: WeightId): SkuKey {
  return `${flavor}|${weight}`;
}

export function formatCentsUSD(cents: number): string {
  const safeCents = Math.round(cents);
  const sign = safeCents < 0 ? '-' : '';
  const abs = Math.abs(safeCents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars}.${rem.toString().padStart(2, '0')}`;
}

export function centsToNumber(cents: number): number {
  return Number((Math.round(cents) / 100).toFixed(2));
}

export interface EcuadorDateTimeParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  dateTimeDisplay: string; // DD/MM/YYYY HH:MM:SS
  isoOffset: string; // YYYY-MM-DDTHH:MM:SS-05:00
  epochMs: number;
}

/**
 * Returns the current date/time in America/Guayaquil (UTC-5).
 */
export function getNowEcuador(now: Date = new Date()): EcuadorDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') === '24' ? '00' : get('hour');
  const minute = get('minute');
  const second = get('second');

  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}`;
  const isoOffset = `${date}T${hour}:${minute}:${second}-05:00`;

  return {
    date,
    time,
    dateTimeDisplay: `${day}/${month}/${year} ${hour}:${minute}:${second}`,
    isoOffset,
    epochMs: now.getTime(),
  };
}

/**
 * Parses a YYYY-MM-DD date and HH:MM time in America/Guayaquil (UTC-5, no DST) into epoch ms.
 * Returns null if invalid format or impossible calendar date.
 */
export function parseEcuadorDateTimeMs(dateStr: string, timeStr: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  // Validate real calendar date (e.g. reject 2026-02-30)
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  // America/Guayaquil is permanently UTC-05:00 (no daylight saving time)
  const utcMs = Date.UTC(year, month - 1, day, hour + 5, minute, 0, 0);
  return utcMs;
}

export function formatEcuadorDateReadable(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function addDaysEcuador(dateStr: string, daysToAdd: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + daysToAdd));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
