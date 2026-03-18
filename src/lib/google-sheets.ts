import { google } from "googleapis";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;

/** Agregar una fila al final de una hoja */
export async function appendRow(sheetName: string, values: unknown[]) {
  if (!SHEET_ID) return;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Limpiar hoja y reescribir con headers + filas */
export async function rewriteSheet(
  sheetName: string,
  headers: string[],
  rows: unknown[][]
) {
  if (!SHEET_ID) return;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:Z10000`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers, ...rows] },
  });
}

/** Eliminar fila por valor en columna específica (omite fila 0 por si es cabecera) */
export async function deleteRowByValue(
  sheetName: string,
  columnIndex: number,
  value: string
) {
  if (!SHEET_ID) return;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:Z10000`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((r, i) => i >= 1 && String(r[columnIndex] ?? "") === value);
  if (rowIndex === -1) return;
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = sheetMeta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (sheet?.properties?.sheetId == null) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
}

/** Actualizar fila existente por valor en columna; si no existe, agregar */
export async function updateRowByValue(
  sheetName: string,
  columnIndex: number,
  value: string,
  newValues: unknown[]
) {
  if (!SHEET_ID) return;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:Z10000`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((r, i) => i >= 1 && String(r[columnIndex] ?? "") === value);
  if (rowIndex === -1) {
    await appendRow(sheetName, newValues);
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A${rowIndex + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newValues] },
  });
}

/** Buscar fila donde todas las columnas coinciden; eliminar esa fila (omite fila 0) */
export async function deleteRowByMatch(
  sheetName: string,
  matches: { columnIndex: number; value: string }[]
) {
  if (!SHEET_ID) return;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:Z10000`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((r, i) => {
    if (i < 1) return false;
    return matches.every((m) => String(r[m.columnIndex] ?? "") === m.value);
  });
  if (rowIndex === -1) return;
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = sheetMeta.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (sheet?.properties?.sheetId == null) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
}

/** Buscar fila por coincidencia en varias columnas; actualizar o agregar */
export async function updateRowByMatch(
  sheetName: string,
  matches: { columnIndex: number; value: string }[],
  newValues: unknown[]
) {
  if (!SHEET_ID) return;
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:Z10000`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((r, i) => {
    if (i < 1) return false;
    return matches.every((m) => String(r[m.columnIndex] ?? "") === m.value);
  });
  if (rowIndex === -1) {
    await appendRow(sheetName, newValues);
    return;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A${rowIndex + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newValues] },
  });
}
