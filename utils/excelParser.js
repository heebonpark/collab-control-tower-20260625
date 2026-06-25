// utils/excelParser.js
// Parses an uploaded Excel file and returns a mapping of region to 담당자.
// Expected columns: 구역번호 (region), 담당자ID (accountId), 담당자명 (name)

import * as XLSX from "xlsx";

export const parseExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        // Convert to a map: { regionId: { accountId, name } }
        const result = {};
        json.forEach((row) => {
          const region = row["구역번호"] || row["Region"] || row["region"];
          const accountId = row["담당자ID"] || row["AccountId"] || row["accountId"];
          const name = row["담당자명"] || row["Name"] || row["name"];
          if (region && accountId) {
            result[region] = { accountId, name };
          }
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
