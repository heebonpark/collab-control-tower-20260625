import React from "react";
import { Circle, Clock, CheckCircle2, AlertTriangle, PauseCircle } from "lucide-react";

// Assuming STATUS and T are imported from appropriate modules
import { STATUS } from "../constants";
import { T } from "../styles";

function StatusPill({ status }) {
  const s = STATUS[status];
  const Icon = s.Icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: s.color, background: `${s.color}1A`, whiteSpace: "nowrap" }}>
      <Icon size={12} strokeWidth={2.5} />{s.label}
    </span>
  );
}

export default StatusPill;
