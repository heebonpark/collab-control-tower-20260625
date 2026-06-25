// components/ui/ExcelUploader.jsx
import React, { useState } from "react";
import { parseExcel } from "../../utils/excelParser";

/**
 * ExcelUploader
 * UI 컴포넌트: 담당자 구역 매핑 파일(.xlsx)을 업로드하고, 파싱된 데이터를 부모에게 전달합니다.
 * 프리미엄 디자인에 맞춰 glassmorphism 스타일을 적용했습니다.
 */
export default function ExcelUploader({ onDataLoaded }) {
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await parseExcel(file);
      onDataLoaded(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("엑셀 파일을 읽는 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={{ marginTop: 12, marginBottom: 12, padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.05)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#64748b" }}>
        담당자 구역 매핑 엑셀 업로드
      </label>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="cct-input"
        style={{ padding: "8px", borderRadius: 8, border: "1px solid #e3e6ec", background: "#fff" }}
      />
      {error && (
        <div style={{ color: "#e5484d", marginTop: 4, fontSize: 12 }}>{error}</div>
      )}
    </div>
  );
}
