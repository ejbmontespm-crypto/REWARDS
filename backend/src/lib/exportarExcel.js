import ExcelJS from "exceljs";

/**
 * Arma y manda un .xlsx a la respuesta — columnas ya en formato ExcelJS
 * ({ header, key, width }), filas como objetos con esas keys.
 */
export async function exportarXlsx(res, { nombreArchivo, nombreHoja, columnas, filas }) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja);
  hoja.columns = columnas;
  hoja.getRow(1).font = { bold: true };
  filas.forEach((fila) => hoja.addRow(fila));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
  await libro.xlsx.write(res);
  res.end();
}
