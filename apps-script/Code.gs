/**
 * Pan & Canela — Google Apps Script Web App para registro de pedidos mayoristas
 *
 * CÓMO USARLO EN LA HOJA QUE ACABAS DE CREAR:
 * 1. Abre tu hoja de Google Sheets "Pan & Canela — Pedidos Mayoristas".
 * 2. En el menú superior ve a: Extensiones -> Apps Script.
 * 3. Borra el contenido que aparece por defecto y pega TODO este código.
 * 4. (Opcional) Si quieres fijar el ID manualmente, reemplaza SPREADSHEET_ID abajo;
 *    si lo dejas vacío (''), usará automáticamente la hoja donde abriste Apps Script.
 * 5. Guarda el proyecto (Ctrl+S o icono de disquete).
 * 6. Haz clic en Implementar -> Nueva implementación -> Tipo: Aplicación web:
 *    - Descripción: Pedidos Pan & Canela
 *    - Ejecutar como: Yo (tu cuenta de Google)
 *    - Quién tiene acceso: Cualquier persona
 * 7. Autoriza los permisos cuando Google te lo pida.
 * 8. Copia la "URL de la aplicación web" (termina en /exec) y agrégala en los
 *    Secretos / variables de entorno del servidor como:
 *    GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
 */

var SPREADSHEET_ID = ''; // Déjalo vacío '' si pegaste este código desde Extensiones -> Apps Script de tu hoja; o pega aquí el ID entre /d/ y /edit
var SHEET_NAME = 'Pedidos';
var IDEMPOTENCY_SHEET_NAME = '_ClavesEnvio';
var SECRET_TOKEN = ''; // Opcional: si pones un texto aquí, coloca el mismo en GOOGLE_APPS_SCRIPT_SECRET del servidor
var TIMEZONE = 'America/Guayaquil';

var HEADERS = [
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
];

var CATALOG = {
  'Tradicional|500 g': { flavor: 'Tradicional', weight: '500 g', cents: 290 },
  'Tradicional|250 g': { flavor: 'Tradicional', weight: '250 g', cents: 170 },
  'Tradicional|100 g': { flavor: 'Tradicional', weight: '100 g', cents: 85 },
  'Nutella|500 g': { flavor: 'Nutella', weight: '500 g', cents: 600 },
  'Nutella|250 g': { flavor: 'Nutella', weight: '250 g', cents: 350 },
  'Nutella|100 g': { flavor: 'Nutella', weight: '100 g', cents: 150 },
  'Higos|500 g': { flavor: 'Higos', weight: '500 g', cents: 440 },
  'Higos|250 g': { flavor: 'Higos', weight: '250 g', cents: 260 },
  'Higos|100 g': { flavor: 'Higos', weight: '100 g', cents: 100 },
};

var FLAVOR_ORDER = ['Tradicional', 'Nutella', 'Higos'];

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function openTargetSpreadsheet() {
  var id = String(SPREADSHEET_ID || '').trim();
  if (id && id !== 'REEMPLAZAR_CON_ID_DE_TU_HOJA') {
    return SpreadsheetApp.openById(id);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('Define SPREADSHEET_ID con el ID de tu hoja de Google Sheets.');
  }
  return active;
}

function formatCents(cents) {
  var abs = Math.abs(Math.round(cents));
  var dollars = Math.floor(abs / 100);
  var rem = abs % 100;
  return '$' + dollars + '.' + (rem < 10 ? '0' + rem : String(rem));
}

function parseEcuadorDateTimeMs(dateStr, timeStr) {
  var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  var tm = /^(\d{2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!dm || !tm) return null;
  var y = Number(dm[1]), m = Number(dm[2]), d = Number(dm[3]);
  var hh = Number(tm[1]), mm = Number(tm[2]);
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  var check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) {
    return null;
  }
  return Date.UTC(y, m - 1, d, hh + 5, mm, 0, 0);
}

function ensureSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#143124');
    headerRange.setFontColor('#FAF4E8');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureIdempotencySheet(ss) {
  var hidden = ss.getSheetByName(IDEMPOTENCY_SHEET_NAME);
  if (!hidden) {
    hidden = ss.insertSheet(IDEMPOTENCY_SHEET_NAME);
    hidden.appendRow(['IdempotencyKey', 'Orden', 'FechaRegistro']);
    hidden.hideSheet();
  }
  return hidden;
}

function findExistingByKey(hiddenSheet, key) {
  var lastRow = hiddenSheet.getLastRow();
  if (lastRow < 2) return null;
  var values = hiddenSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === key) {
      return { orderCode: String(values[i][1]), registeredAt: String(values[i][2]) };
    }
  }
  return null;
}

function generateNextOrderCode(sheet) {
  var lastRow = sheet.getLastRow();
  var maxNum = 0;
  if (lastRow >= 2) {
    var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < codes.length; i++) {
      var m = /^PC-(\d+)$/.exec(String(codes[i][0] || '').trim());
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }
  var next = maxNum + 1;
  return 'PC-' + ('0000' + next).slice(-4);
}

function doGet() {
  try {
    var ss = openTargetSpreadsheet();
    ensureSheet(ss);
    return jsonResponse({
      ok: true,
      service: 'Pan & Canela Pedidos Mayoristas',
      spreadsheet: ss.getName(),
      sheet: SHEET_NAME,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'El servidor está ocupado. Intenta de nuevo en unos segundos.' });
  }

  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(rawBody);

    if (SECRET_TOKEN && payload.secretToken !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: 'Token de autorización inválido.' });
    }

    var idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return jsonResponse({ ok: false, error: 'Falta la clave de idempotencia del pedido.' });
    }

    var customerName = String(payload.customerName || '').replace(/\s+/g, ' ').trim();
    if (customerName.length < 3) {
      return jsonResponse({ ok: false, error: 'Nombre del cliente inválido.' });
    }

    // Revalidar cantidades y precios en centavos
    var quantities = payload.quantities || {};
    var lineItems = [];
    var totalBreads = 0;
    var totalCents = 0;
    var activeFlavors = {};

    var skuKeys = Object.keys(CATALOG);
    for (var i = 0; i < skuKeys.length; i++) {
      var k = skuKeys[i];
      var q = Number(quantities[k] || 0);
      if (!Number.isInteger(q) || q < 0) {
        return jsonResponse({ ok: false, error: 'Cantidad inválida para ' + k });
      }
      if (q > 0) {
        var sku = CATALOG[k];
        var sub = q * sku.cents;
        lineItems.push({ key: k, sku: sku, qty: q, sub: sub });
        totalBreads += q;
        totalCents += sub;
        activeFlavors[sku.flavor] = true;
      }
    }

    if (totalBreads < 20) {
      return jsonResponse({ ok: false, error: 'El pedido mínimo mayorista es de 20 panes.' });
    }

    var splitDeliveries = Boolean(payload.splitDeliveries);
    if (splitDeliveries && totalBreads < 50) {
      return jsonResponse({ ok: false, error: 'Solo puedes dividir entregas desde 50 panes.' });
    }

    var deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];
    if (!splitDeliveries && deliveries.length !== 1) {
      return jsonResponse({ ok: false, error: 'Se requiere exactamente 1 entrega.' });
    }
    if (splitDeliveries && (deliveries.length < 2 || deliveries.length > 3)) {
      return jsonResponse({ ok: false, error: 'Las entregas divididas deben ser 2 o 3 fechas.' });
    }

    var nowMs = Date.now();
    var seenDates = {};
    var allocated = {};
    var normalized = [];

    for (var dIdx = 0; dIdx < deliveries.length; dIdx++) {
      var d = deliveries[dIdx];
      var ms = parseEcuadorDateTimeMs(d.date, d.time);
      if (ms === null || ms <= nowMs) {
        return jsonResponse({ ok: false, error: 'Todas las entregas deben tener fecha y hora futura en Ecuador.' });
      }
      if (splitDeliveries) {
        if (seenDates[d.date]) {
          return jsonResponse({ ok: false, error: 'No puedes repetir fechas en entregas divididas.' });
        }
        seenDates[d.date] = true;
      }

      var parts = [];
      var dTotal = 0;
      for (var li = 0; li < lineItems.length; li++) {
        var item = lineItems[li];
        var assigned = splitDeliveries ? Number((d.items || {})[item.key] || 0) : item.qty;
        if (!Number.isInteger(assigned) || assigned < 0) {
          return jsonResponse({ ok: false, error: 'Distribución inválida.' });
        }
        if (assigned > 0) {
          parts.push(assigned + 'x ' + item.sku.flavor + ' ' + item.sku.weight);
          dTotal += assigned;
          allocated[item.key] = (allocated[item.key] || 0) + assigned;
        }
      }
      if (dTotal < 1) {
        return jsonResponse({ ok: false, error: 'Cada fecha debe tener al menos 1 pan.' });
      }
      normalized.push({ date: d.date, time: d.time, ms: ms, total: dTotal, breakdown: parts.join(', ') });
    }

    if (splitDeliveries) {
      for (var li2 = 0; li2 < lineItems.length; li2++) {
        var it2 = lineItems[li2];
        if ((allocated[it2.key] || 0) !== it2.qty) {
          return jsonResponse({ ok: false, error: 'La distribución por fechas no coincide con el carrito.' });
        }
      }
    }

    normalized.sort(function (a, b) { return a.ms - b.ms; });

    var ss = openTargetSpreadsheet();
    var sheet = ensureSheet(ss);
    var hiddenSheet = ensureIdempotencySheet(ss);

    // Evitar duplicados si el cliente reintenta
    var existing = findExistingByKey(hiddenSheet, idempotencyKey);
    if (existing) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        orderCode: existing.orderCode,
        registeredAt: existing.registeredAt,
        totalUsd: Number((totalCents / 100).toFixed(2)),
      });
    }

    var orderCode = generateNextOrderCode(sheet);
    var registeredAt = Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm:ss');

    var detailLines = [];
    for (var li3 = 0; li3 < lineItems.length; li3++) {
      var it3 = lineItems[li3];
      detailLines.push(
        it3.qty + 'x ' + it3.sku.flavor + ' ' + it3.sku.weight +
        ' (' + formatCents(it3.sku.cents) + ') = ' + formatCents(it3.sub)
      );
    }

    var rellenosList = [];
    for (var fi = 0; fi < FLAVOR_ORDER.length; fi++) {
      if (activeFlavors[FLAVOR_ORDER[fi]]) rellenosList.push(FLAVOR_ORDER[fi]);
    }

    var scheduledCell = '';
    if (normalized.length > 1) {
      var schedLines = [];
      for (var si = 0; si < normalized.length; si++) {
        var nd = normalized[si];
        schedLines.push(nd.date + ' ' + nd.time + ': ' + nd.breakdown + ' (' + nd.total + ' panes)');
      }
      scheduledCell = schedLines.join('\n');
    }

    var totalNumeric = Number((totalCents / 100).toFixed(2));
    var newRowIndex = sheet.getLastRow() + 1;

    sheet.getRange(newRowIndex, 1, 1, 10).setValues([[
      orderCode,
      registeredAt,
      customerName,
      normalized[0].date,
      normalized[0].time,
      detailLines.join('\n'),
      rellenosList.join(', '),
      scheduledCell,
      totalNumeric,
      false,
    ]]);

    // Formato de moneda USD en columna Total (9), ajuste de texto en Detalle/Entregas y casilla sin marcar en Anotado (10)
    sheet.getRange(newRowIndex, 6, 1, 3).setWrap(true).setVerticalAlignment('top');
    sheet.getRange(newRowIndex, 9).setNumberFormat('$#,##0.00');
    sheet.getRange(newRowIndex, 10).insertCheckboxes().setValue(false);

    hiddenSheet.appendRow([idempotencyKey, orderCode, registeredAt]);

    SpreadsheetApp.flush();

    return jsonResponse({
      ok: true,
      orderCode: orderCode,
      registeredAt: registeredAt,
      totalUsd: totalNumeric,
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: 'Error al escribir en Google Sheets: ' + String(err),
    });
  } finally {
    lock.releaseLock();
  }
}
