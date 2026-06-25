// constants.js
export const T = {
  ink: "#14171F",
  sub: "#5B6270",
  faint: "#9AA1AC",
  canvas: "#F2F4F8",
  surface: "#FFFFFF",
  border: "#E3E6EC",
  hq: "#3851D6",
  hqSoft: "#EBEFFC",
  branch: "#E08A2C",
  branchSoft: "#FBF1E3",
  admin: "#7C3AED",
  adminSoft: "#F1E9FE",
  pending: "#9AA1AC",
  progress: "#2F8FE0",
  done: "#1FA67A",
  delayed: "#E5484D",
  hold: "#C28E1F",
  request: "#C28E1F",
};

export const STATUS = {
  pending: { label: "대기", color: T.pending, Icon: Circle },
  progress: { label: "진행중", color: T.progress, Icon: Clock },
  done: { label: "완료", color: T.done, Icon: CheckCircle2 },
  delayed: { label: "지연", color: T.delayed, Icon: AlertTriangle },
  hold: { label: "보류", color: T.hold, Icon: PauseCircle },
};
