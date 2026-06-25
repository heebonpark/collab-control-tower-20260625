import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import pandas as pd
import win32com.client as win32
import pythoncom
import threading
import datetime

# 실제 발신 계정. Outlook 프로필에 이미 연결되어 있는 계정을 그대로 쓴다.
MASTER_SEND_ACCOUNT = "bough38@gmail.com"

# 모든 발송 메일에 항상 참조(CC)로 끼워 넣을 회사 공식 메일.
# 받는 사람이 누구든, 이 주소가 항상 참조에 포함되어 본부에서도 발송 내역을
# 그대로 확인할 수 있게 한다.
ALWAYS_CC = "heebon.park@kt.com"


class ExpertMailSender:
    def __init__(self, root):
        self.root = root
        self.root.title("KT지사 캠페인 메일 발송기 (Ver 5.2 - 마스터 계정 발신 적용)")
        self.root.geometry("600x840")
        self.root.resizable(False, False)

        # 스타일 설정
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TLabel", font=("맑은 고딕", 9))
        style.configure("TButton", font=("맑은 고딕", 9, "bold"))
        style.configure("Header.TLabel", font=("맑은 고딕", 11, "bold"), foreground="#004080")

        # ==========================================
        # 0. 발신 계정 표시
        # ==========================================
        self.frame_account = ttk.LabelFrame(root, text="0. 발신 계정 (고정)", padding=10)
        self.frame_account.pack(fill="x", padx=10, pady=(10, 0))

        self.lbl_account_status = ttk.Label(
            self.frame_account,
            text=f"발신: {MASTER_SEND_ACCOUNT}  (확인 중...)",
            foreground="gray",
        )
        self.lbl_account_status.pack(anchor="w")
        ttk.Label(
            self.frame_account,
            text=f"위 계정으로 발송하며, 모든 메일에 {ALWAYS_CC}이 참조(CC)로 자동 포함됩니다.\n"
                 "(받는사람이 누구든 본부 공식 메일로 항상 발송 내역이 같이 공유됩니다)",
            foreground="gray", font=("맑은 고딕", 8),
        ).pack(anchor="w", pady=(2, 0))

        # ==========================================
        # 1. 파일 및 시트 선택
        # ==========================================
        self.frame_top = ttk.LabelFrame(root, text="1. 엑셀 연결 및 시트 선택", padding=15)
        self.frame_top.pack(fill="x", padx=10, pady=10)

        ttk.Label(self.frame_top, text="① 열려있는 엑셀 파일:").grid(row=0, column=0, sticky="w", pady=5)
        self.combo_files = ttk.Combobox(self.frame_top, state="readonly", width=40)
        self.combo_files.grid(row=0, column=1, sticky="ew", padx=5)
        self.combo_files.bind("<<ComboboxSelected>>", self.on_file_select)

        self.btn_refresh = ttk.Button(self.frame_top, text="새로고침", command=self.refresh_file_list)
        self.btn_refresh.grid(row=0, column=2, padx=5)

        ttk.Label(self.frame_top, text="② 데이터 시트 (발송대상):").grid(row=1, column=0, sticky="w", pady=5)
        self.combo_sheet_data = ttk.Combobox(self.frame_top, state="readonly", width=40)
        self.combo_sheet_data.grid(row=1, column=1, sticky="ew", padx=5)

        ttk.Label(self.frame_top, text="③ 메일 정보 시트:").grid(row=2, column=0, sticky="w", pady=5)
        self.combo_sheet_mail = ttk.Combobox(self.frame_top, state="readonly", width=40)
        self.combo_sheet_mail.grid(row=2, column=1, sticky="ew", padx=5)

        lbl_guide = ttk.Label(
            self.frame_top,
            text="   • [데이터] '담당자명'(F열) 우선 인식\n   • [메일] A열:이름 / C열:메일 / D열:참조",
            foreground="gray", font=("맑은 고딕", 8),
        )
        lbl_guide.grid(row=3, column=1, sticky="w")

        # ==========================================
        # 2. 메일 내용 및 옵션
        # ==========================================
        self.frame_mid = ttk.LabelFrame(root, text="2. 메일 설정", padding=15)
        self.frame_mid.pack(fill="x", padx=10, pady=5)

        ttk.Label(self.frame_mid, text="메일 제목:").pack(anchor="w")
        self.entry_subject = ttk.Entry(self.frame_mid)
        self.entry_subject.insert(0, "관리고객 현황공유 및 관리 고객 리스트 안내")
        self.entry_subject.pack(fill="x", pady=(5, 10))

        ttk.Label(self.frame_mid, text="본문 인사말 (HTML):").pack(anchor="w")
        self.txt_body = tk.Text(self.frame_mid, height=5, font=("맑은 고딕", 9))
        default_body = (
            "안녕하십니까?<br>관리고객 우선 방문, 재계약 현황 등 리스트를 첨부드리오니 업무에 참고하시기 바랍니다."
            "<br><br>지사구분1 \"만기되는_신규 > 관리고객_2월\" 우선순위로 처리해주시면 감사하겠습니다."
        )
        self.txt_body.insert("1.0", default_body)
        self.txt_body.pack(fill="x", pady=5)

        self.var_preview = tk.BooleanVar(value=True)
        self.chk_preview = ttk.Checkbutton(
            self.frame_mid, text="안전 모드: 처음 2건은 미리보기 창 띄움 (검토 후 발송)", variable=self.var_preview
        )
        self.chk_preview.pack(anchor="w", pady=(10, 0))

        # ==========================================
        # 3. 실행 및 로그
        # ==========================================
        self.frame_bot = ttk.LabelFrame(root, text="3. 진행 상황", padding=15)
        self.frame_bot.pack(fill="both", expand=True, padx=10, pady=10)

        self.btn_run = ttk.Button(self.frame_bot, text="메일 발송 시작", command=self.start_process)
        self.btn_run.pack(fill="x", pady=(0, 10))

        self.log_area = scrolledtext.ScrolledText(self.frame_bot, state='disabled', height=10, font=("Consolas", 9))
        self.log_area.pack(fill="both", expand=True)

        self.progress = ttk.Progressbar(root, mode="indeterminate")
        self.progress.pack(fill="x")

        # 초기화
        self.master_account_obj = None
        self.refresh_file_list()
        self.check_master_account()

    def log(self, msg):
        self.log_area.config(state='normal')
        time_str = datetime.datetime.now().strftime("%H:%M:%S")
        self.log_area.insert("end", f"[{time_str}] {msg}\n")
        self.log_area.see("end")
        self.log_area.config(state='disabled')

    # ------------------------------------------------------------------
    # 마스터(회사 공식) 발신 계정 확인
    # ------------------------------------------------------------------
    def find_account(self, outlook, smtp_address):
        """현재 Outlook 프로필에 추가된 계정 중 smtp_address와 일치하는 Account 객체를 찾는다."""
        try:
            for account in outlook.Session.Accounts:
                addr = (account.SmtpAddress or "").strip().lower()
                if addr == smtp_address.strip().lower():
                    return account
        except Exception:
            pass
        return None

    def check_master_account(self):
        """발신 계정이 Outlook 프로필에 실제로 존재하는지 미리 확인해서 UI에 표시한다."""
        try:
            outlook = win32.GetActiveObject("Outlook.Application")
        except Exception:
            try:
                outlook = win32.Dispatch("Outlook.Application")
            except Exception:
                self.lbl_account_status.config(
                    text=f"발신: {MASTER_SEND_ACCOUNT}  (확인 불가 - Outlook 실행 필요)", foreground="#C28E1F"
                )
                return

        account = self.find_account(outlook, MASTER_SEND_ACCOUNT)
        if account:
            self.master_account_obj = account
            self.lbl_account_status.config(
                text=f"발신: {MASTER_SEND_ACCOUNT}  (Outlook에 연결됨 - 정상)", foreground="#1FA67A"
            )
        else:
            self.master_account_obj = None
            self.lbl_account_status.config(
                text=f"발신: {MASTER_SEND_ACCOUNT}  (Outlook 프로필에 없음! 계정 추가 필요)",
                foreground="#E5484D",
            )

    def refresh_file_list(self):
        try:
            excel = win32.GetObject(Class="Excel.Application")
            files = [wb.Name for wb in excel.Workbooks]
            self.combo_files['values'] = files
            if files:
                self.combo_files.current(0)
                self.on_file_select(None)
                self.log(f"엑셀 파일 {len(files)}개 감지됨.")
            else:
                self.log("열려있는 엑셀 파일이 없습니다.")
                self.combo_files.set('')
        except Exception:
            self.log("엑셀 프로그램을 찾을 수 없습니다.")

    def on_file_select(self, event):
        filename = self.combo_files.get()
        if not filename:
            return
        try:
            excel = win32.GetObject(Class="Excel.Application")
            wb = next((w for w in excel.Workbooks if w.Name == filename), None)
            if wb:
                sheets = [ws.Name for ws in wb.Worksheets]
                self.combo_sheet_data['values'] = sheets
                self.combo_sheet_mail['values'] = sheets

                for s in sheets:
                    if "현황" in s or "관리" in s or "취합" in s:
                        self.combo_sheet_data.set(s)
                    if "메일" in s or "담당" in s:
                        self.combo_sheet_mail.set(s)
                self.log(f"'{filename}' 시트 목록 로드 완료.")
        except Exception as e:
            self.log(f"시트 로드 실패: {e}")

    def start_process(self):
        file_name = self.combo_files.get()
        sheet_data = self.combo_sheet_data.get()
        sheet_mail = self.combo_sheet_mail.get()

        if not all([file_name, sheet_data, sheet_mail]):
            messagebox.showwarning("경고", "파일과 시트를 모두 선택해주세요.")
            return

        self.check_master_account()
        if not self.master_account_obj:
            if not messagebox.askyesno(
                "발신 계정 확인 필요",
                f"{MASTER_SEND_ACCOUNT} 계정이 Outlook 프로필에 보이지 않습니다.\n"
                "이 상태로 보내면 Outlook의 기본 계정으로 발송되어, 받는 사람에게 보낸사람이\n"
                "다르게 표시될 수 있습니다.\n\n그래도 계속 진행하시겠습니까?",
            ):
                return

        if messagebox.askyesno(
            "확인",
            f"선택한 설정으로 발송을 시작합니다.\n\n"
            f"발신 계정: {MASTER_SEND_ACCOUNT}\n"
            f"항상 참조: {ALWAYS_CC}\n"
            f"데이터시트: {sheet_data}\n메일정보: {sheet_mail}",
        ):
            self.btn_run.config(state="disabled")
            self.progress.start(10)

            t = threading.Thread(target=self.run_logic, args=(file_name, sheet_data, sheet_mail))
            t.daemon = True
            t.start()

    def run_logic(self, file_name, s_data_name, s_mail_name):
        pythoncom.CoInitialize()
        try:
            excel = win32.GetActiveObject(Class="Excel.Application")
            wb = next((w for w in excel.Workbooks if w.Name == file_name), None)
            if not wb:
                raise Exception("파일이 닫혔거나 찾을 수 없습니다.")

            def get_df(sheet_name):
                ws = wb.Worksheets(sheet_name)
                data = ws.UsedRange.Value
                if not data:
                    return pd.DataFrame()
                rows = list(data)
                return pd.DataFrame(rows[1:], columns=rows[0])

            self.log("데이터 읽는 중...")
            df_data = get_df(s_data_name)
            df_mail = get_df(s_mail_name)

            df_data.columns = [str(c).strip() for c in df_data.columns]
            df_mail.columns = [str(c).strip() for c in df_mail.columns]

            target_col = None
            possible_cols = ["담당자명", "담당자", "영업담당자", "사원명"]
            for col in possible_cols:
                if col in df_data.columns:
                    target_col = col
                    break

            if not target_col:
                raise Exception("데이터 시트에서 '담당자명' 또는 '담당자' 열을 찾을 수 없습니다.")

            self.log(f"기준 열 인식 성공: '{target_col}'")

            mail_map = {}
            for i in range(len(df_mail)):
                try:
                    name = str(df_mail.iloc[i, 0]).strip()  # A열
                    to_addr = str(df_mail.iloc[i, 2]).strip()  # C열

                    cc_addr = ""
                    if df_mail.shape[1] > 3:  # D열
                        val = df_mail.iloc[i, 3]
                        if pd.notna(val):
                            raw_cc = str(val).strip()
                            if raw_cc.lower() != 'nan':
                                cc_addr = raw_cc.replace(",", ";").replace("\n", ";")

                    if name and to_addr and to_addr.lower() != 'nan':
                        mail_map[name] = {"to": to_addr, "cc": cc_addr}
                except Exception:
                    continue

            # Outlook 연결 + 발신 계정 재확인 (백그라운드 스레드 안에서 다시 확인)
            outlook = win32.Dispatch("Outlook.Application")
            send_account = self.find_account(outlook, MASTER_SEND_ACCOUNT)
            if send_account:
                self.log(f"발신 계정 연결됨: {MASTER_SEND_ACCOUNT} (이 계정의 보낸편지함에 기록됩니다)")
            else:
                self.log(f"⚠ 발신 계정({MASTER_SEND_ACCOUNT})이 Outlook에 없어 기본 계정으로 발송됩니다.")

            managers = df_data[target_col].dropna().unique()

            subject_tmpl = self.entry_subject.get()
            body_tmpl = self.txt_body.get("1.0", "end").strip().replace("\n", "<br>")

            managers_list = [str(m).strip() for m in managers if str(m).strip() in mail_map]
            total_count = len(managers_list)

            self.log(f"총 {total_count}명의 담당자 메일 생성 시작.")

            sent_count = 0
            is_preview_mode = self.var_preview.get()
            continue_sending = True

            for idx, mgr_name in enumerate(managers_list):
                if not continue_sending:
                    self.log("작업 중단됨.")
                    break

                info = mail_map[mgr_name]
                my_df = df_data[df_data[target_col] == mgr_name]
                html_table = self.make_html_table(my_df)

                mail = outlook.CreateItem(0)

                # 핵심: 어느 계정으로 "보낼지"를 명시적으로 지정한다.
                # 이걸 지정하지 않으면 Outlook이 기본 계정(개인 메일일 수 있음)으로 보내버린다.
                if send_account:
                    mail.SendUsingAccount = send_account

                mail.To = info["to"]
                # 기존 참조 + 회사 공식 메일을 항상 참조로 합쳐서 넣는다 (중복 방지)
                cc_list = [c for c in [info["cc"]] if c]
                cc_list.append(ALWAYS_CC)
                mail.CC = "; ".join(dict.fromkeys(";".join(cc_list).split(";")))

                mail.Subject = f"[{mgr_name}] {subject_tmpl}"
                mail.HTMLBody = f"""
                <div style="font-family:'Malgun Gothic', sans-serif; font-size:13px; color:#333;">
                    {body_tmpl}<br><br>
                    <h3 style="color:#004080; border-bottom:2px solid #004080; padding-bottom:5px;">
                        [ {mgr_name}님 담당 고객 리스트 ]
                    </h3>
                    {html_table}
                </div>
                """

                if is_preview_mode and idx < 2:
                    mail.Display()
                    self.log(f"[미리보기] {mgr_name}")
                    if idx == 1:
                        ans = messagebox.askyesno(
                            "확인", "처음 2건의 미리보기가 정상인가요?\n[예]를 누르면 나머지를 일괄 발송합니다."
                        )
                        if not ans:
                            continue_sending = False
                else:
                    mail.Send()
                    self.log(f"[발송] {mgr_name} -> {info['to']}")
                    sent_count += 1

            if continue_sending:
                self.log(f"완료: 총 {sent_count}건 발송됨.")
                messagebox.showinfo("완료", "발송이 완료되었습니다.")
            else:
                self.log("발송이 취소되었습니다.")

        except Exception as e:
            self.log(f"오류: {e}")
            messagebox.showerror("오류", str(e))
        finally:
            self.progress.stop()
            self.btn_run.config(state="normal")
            pythoncom.CoUninitialize()

    def make_html_table(self, df):
        if df.empty:
            return ""

        th = "".join(
            [f'<th style="background:#004080; color:#fff; padding:6px; border:1px solid #ddd;">{c}</th>' for c in df.columns]
        )

        tr_list = []
        for _, row in df.iterrows():
            tds = []
            for v in row:
                try:
                    if v is None:
                        s = ""
                    else:
                        s = str(v)
                        if s.endswith(".0"):
                            s = s[:-2]
                        if " 00:00:00" in s:
                            s = s.replace(" 00:00:00", "")
                except Exception:
                    s = ""

                tds.append(f'<td style="padding:5px; border:1px solid #ddd; text-align:center;">{s}</td>')
            tr_list.append(f"<tr>{''.join(tds)}</tr>")

        return (
            f'<table style="border-collapse:collapse; width:100%; font-size:12px; border:1px solid #ddd;">'
            f'<thead><tr>{th}</tr></thead><tbody>{"".join(tr_list)}</tbody></table>'
        )


if __name__ == "__main__":
    root = tk.Tk()
    app = ExpertMailSender(root)
    root.mainloop()
