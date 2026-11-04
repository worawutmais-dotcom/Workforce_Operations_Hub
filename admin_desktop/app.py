"""BVN Package Admin Desktop.

The desktop application intentionally runs with local demo data until an
authenticated Google Apps Script endpoint is configured. It never writes a
payroll, attendance, or invoice record directly to a Google Sheet URL.
"""

from __future__ import annotations

import json
import csv
import os
import sys
import tkinter as tk
from datetime import date, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen
from dataclasses import dataclass, replace
from pathlib import Path
from tkinter import messagebox, simpledialog, ttk

# A PyInstaller one-file build extracts ``__file__`` to a temporary directory.
# Settings must instead live beside the executable so they survive relaunches.
APP_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent
)
CONFIG_PATH = APP_DIR / "admin_config.json"


@dataclass(frozen=True, slots=True)
class Employee:
    employee_id: str
    name: str
    role: str
    status: str


@dataclass(frozen=True, slots=True)
class AttendanceException:
    employee: str
    reason: str
    occurred_at: str
    status: str


@dataclass(frozen=True, slots=True)
class Invoice:
    invoice_no: str
    customer: str
    description: str
    subtotal: float
    vat: float
    due_date: str
    status: str

    @property
    def total(self) -> float:
        return self.subtotal + self.vat


@dataclass(frozen=True, slots=True)
class DashboardData:
    present: int
    total_employees: int
    exceptions: int
    estimated_payroll: int
    overdue_invoices: int
    pending_approvals: int
    latest_payroll_id: str
    latest_payroll_status: str
    employee_rows: tuple[Employee, ...]
    exception_rows: tuple[AttendanceException, ...]


def load_config() -> dict[str, str]:
    if not CONFIG_PATH.exists():
        return {"apps_script_endpoint": ""}
    try:
        payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError("admin_config.json is invalid JSON") from error
    endpoint = payload.get("apps_script_endpoint", "")
    return {"apps_script_endpoint": endpoint if isinstance(endpoint, str) else ""}


def fetch_live_dashboard(endpoint: str, admin_token: str, timeout_seconds: int = 8) -> DashboardData:
    """Read the restricted dashboard action without storing an admin secret locally."""
    body = json.dumps({"action": "dashboard", "adminToken": admin_token}).encode("utf-8")
    request = Request(endpoint, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError("เชื่อมต่อ Apps Script ไม่สำเร็จ") from error
    if not payload.get("ok") or not isinstance(payload.get("data"), dict):
        raise RuntimeError(str(payload.get("message") or "Apps Script ปฏิเสธคำขอ"))
    data = payload["data"]
    return DashboardData(
        present=int(data.get("present", 0)),
        total_employees=int(data.get("totalEmployees", 0)),
        exceptions=int(data.get("exceptions", 0)),
        estimated_payroll=0,
        overdue_invoices=int(float(data.get("overdueInvoices", 0))),
        pending_approvals=int(data.get("pendingApprovals", 0)),
        latest_payroll_id=str(data.get("latestPayrollId", "")),
        latest_payroll_status=str(data.get("latestPayrollStatus", "")),
        employee_rows=(),
        exception_rows=(),
    )


def call_admin_api(endpoint: str, admin_token: str, action: str, **fields: object) -> dict[str, object]:
    """Call an owner-only Apps Script action; never persist the admin key."""
    body = json.dumps({"action": action, "adminToken": admin_token, **fields}).encode("utf-8")
    request = Request(endpoint, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError("เชื่อมต่อ Apps Script ไม่สำเร็จ") from error
    if not payload.get("ok"):
        raise RuntimeError(str(payload.get("message") or "Apps Script ปฏิเสธคำขอ"))
    return payload if isinstance(payload, dict) else {}


class AdminApp(tk.Tk):
    """Tkinter shell for the shop owner and HR administrator."""

    pages: tuple[str, ...] = ("วันนี้", "พนักงาน", "งานรออนุมัติ", "เงินเดือน", "เอกสาร", "ตั้งค่า")

    def __init__(self) -> None:
        super().__init__()
        self.title("BVN Package | Admin")
        self.geometry("1180x720")
        self.minsize(960, 620)
        self.configure(background="#F5F8FB")
        self.dashboard = DashboardData(0, 0, 0, 0, 0, 0, "", "", (), ())
        self.dashboard_live = False
        self.dashboard_message = "ยังไม่ได้ดึงข้อมูลจากระบบกลาง"
        self.employee_details: dict[str, dict[str, object]] = {}
        self.config_data = load_config()
        self.invoices: list[Invoice] = []
        self._build_shell()
        self.show_page("วันนี้")

    def _build_shell(self) -> None:
        self.sidebar = tk.Frame(self, background="#102A43", width=230)
        self.sidebar.pack(side=tk.LEFT, fill=tk.Y)
        self.sidebar.pack_propagate(False)
        tk.Label(
            self.sidebar,
            text="BVN PACKAGE",
            font=("Segoe UI", 17, "bold"),
            foreground="white",
            background="#102A43",
        ).pack(anchor="w", padx=22, pady=(26, 2))
        tk.Label(
            self.sidebar,
            text="ระบบจัดการร้านและพนักงาน",
            font=("Segoe UI", 10),
            foreground="#9FB3C8",
            background="#102A43",
        ).pack(anchor="w", padx=22, pady=(0, 24))
        self.nav_buttons: dict[str, tk.Button] = {}
        for name in self.pages:
            button = tk.Button(
                self.sidebar,
                text=name,
                command=lambda current=name: self.show_page(current),
                anchor="w",
                relief=tk.FLAT,
                borderwidth=0,
                font=("Segoe UI", 11),
                foreground="#C5D4E3",
                activeforeground="white",
                activebackground="#243B53",
                background="#102A43",
                padx=20,
                pady=12,
            )
            button.pack(fill=tk.X, padx=8, pady=2)
            self.nav_buttons[name] = button
        tk.Label(
            self.sidebar,
            text="Google Sheet mode\nเขียนข้อมูลผ่าน Apps Script เท่านั้น",
            justify=tk.LEFT,
            font=("Segoe UI", 9),
            foreground="#9FB3C8",
            background="#102A43",
        ).pack(side=tk.BOTTOM, anchor="w", padx=20, pady=24)
        self.content = tk.Frame(self, background="#F5F8FB")
        self.content.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    def show_page(self, page: str) -> None:
        page = {"ทีมงาน": "พนักงาน", "ตรวจเวลา": "งานรออนุมัติ", "ออกบิล": "เอกสาร"}.get(page, page)
        for child in self.content.winfo_children():
            child.destroy()
        for name, button in self.nav_buttons.items():
            button.configure(background="#243B53" if name == page else "#102A43", foreground="white" if name == page else "#C5D4E3")
        if page == "วันนี้":
            self._dashboard_page()
        elif page == "พนักงาน":
            self._employee_page()
        elif page == "งานรออนุมัติ":
            self._attendance_page()
        elif page == "เงินเดือน":
            self._ledger_page("Payroll รอบ ตุลาคม 2026", "฿1,240,000", "รอแก้ไขเวลา 5 รายการ")
        elif page == "เอกสาร":
            self._invoice_page()
        else:
            self._settings_page()

    def _header(self, title: str, subtitle: str) -> tk.Frame:
        frame = tk.Frame(self.content, background="#F5F8FB")
        frame.pack(fill=tk.X, padx=34, pady=(28, 16))
        tk.Label(frame, text=title, font=("Segoe UI", 24, "bold"), foreground="#172B4D", background="#F5F8FB").pack(anchor="w")
        tk.Label(frame, text=subtitle, font=("Segoe UI", 10), foreground="#627D98", background="#F5F8FB").pack(anchor="w", pady=(4, 0))
        return frame

    def _card(self, parent: tk.Misc, label: str, value: str, note: str) -> None:
        card = tk.Frame(parent, background="white", highlightbackground="#D9E2EC", highlightthickness=1)
        card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=6)
        tk.Label(card, text=label, font=("Segoe UI", 10), foreground="#627D98", background="white").pack(anchor="w", padx=16, pady=(14, 4))
        tk.Label(card, text=value, font=("Segoe UI", 21, "bold"), foreground="#172B4D", background="white").pack(anchor="w", padx=16)
        tk.Label(card, text=note, font=("Segoe UI", 9), foreground="#0B8F62", background="white").pack(anchor="w", padx=16, pady=(2, 14))

    def _command_metric(self, parent: tk.Misc, label: str, value: str, detail: str, accent: str, target: str) -> None:
        """A large, clickable decision metric for the command-center dashboard."""
        card = tk.Frame(parent, background="#FFFFFF", highlightbackground="#E3EAF2", highlightthickness=1, cursor="hand2")
        card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        bar = tk.Frame(card, background=accent, height=4)
        bar.pack(fill=tk.X)
        label_widget = tk.Label(card, text=label.upper(), font=("Segoe UI", 9, "bold"), foreground="#627D98", background="white")
        label_widget.pack(anchor="w", padx=16, pady=(15, 4))
        value_widget = tk.Label(card, text=value, font=("Segoe UI", 25, "bold"), foreground="#102A43", background="white")
        value_widget.pack(anchor="w", padx=16)
        detail_widget = tk.Label(card, text=detail + "  →", font=("Segoe UI", 9, "bold"), foreground=accent, background="white")
        detail_widget.pack(anchor="w", padx=16, pady=(2, 15))
        for widget in (card, bar, label_widget, value_widget, detail_widget):
            widget.bind("<Button-1>", lambda _event, destination=target: self.show_page(destination))

    def _priority_row(self, parent: tk.Misc, severity: str, title: str, detail: str, target: str, color: str) -> None:
        row = tk.Frame(parent, background="white")
        row.pack(fill=tk.X, padx=18, pady=6)
        chip = tk.Label(row, text=severity, font=("Segoe UI", 8, "bold"), foreground="white", background=color, padx=8, pady=3)
        chip.pack(side=tk.LEFT, padx=(0, 10))
        text = tk.Frame(row, background="white")
        text.pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Label(text, text=title, font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="white").pack(anchor="w")
        tk.Label(text, text=detail, font=("Segoe UI", 9), foreground="#627D98", background="white").pack(anchor="w")
        tk.Button(row, text="จัดการ", command=lambda: self.show_page(target), font=("Segoe UI", 9, "bold"), foreground="#146EF5", background="white", activebackground="white", relief=tk.FLAT, cursor="hand2").pack(side=tk.RIGHT)

    def _dashboard_page(self) -> None:
        hero = tk.Frame(self.content, background="#102A43", height=116)
        hero.pack(fill=tk.X, padx=28, pady=(24, 16))
        hero.pack_propagate(False)
        left = tk.Frame(hero, background="#102A43")
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=22, pady=18)
        tk.Label(left, text="BVN PACKAGE  /  OPERATIONS COMMAND CENTER", font=("Segoe UI", 9, "bold"), foreground="#9FB3C8", background="#102A43").pack(anchor="w")
        tk.Label(left, text="วันนี้ร้านพร้อมดำเนินงานหรือไม่?", font=("Segoe UI", 22, "bold"), foreground="white", background="#102A43").pack(anchor="w", pady=(3, 0))
        tk.Label(left, text="สรุปเฉพาะสิ่งที่ต้องตัดสินใจก่อนปิดวัน", font=("Segoe UI", 10), foreground="#C5D4E3", background="#102A43").pack(anchor="w")
        right = tk.Frame(hero, background="#102A43")
        right.pack(side=tk.RIGHT, padx=22, pady=25)
        tk.Label(right, text="DATA STATUS", font=("Segoe UI", 8, "bold"), foreground="#9FB3C8", background="#102A43").pack(anchor="e")
        tk.Label(right, text="LIVE DATA" if self.dashboard_live else "NOT CONNECTED", font=("Segoe UI", 12, "bold"), foreground="#29C28A" if self.dashboard_live else "#F6C453", background="#102A43").pack(anchor="e", pady=(1, 7))
        tk.Button(right, text="↻  ดึงข้อมูลล่าสุด", command=self._refresh_dashboard, background="#146EF5", foreground="white", activebackground="#0E5DCE", relief=tk.FLAT, padx=13, pady=7, cursor="hand2").pack(anchor="e")

        risk = tk.Frame(self.content, background="#FFF5E5", highlightbackground="#F6C453", highlightthickness=1)
        risk.pack(fill=tk.X, padx=28, pady=(0, 14))
        tk.Label(risk, text="!", font=("Segoe UI", 14, "bold"), foreground="#9C5A00", background="#FFF5E5", width=3).pack(side=tk.LEFT, padx=(12, 4), pady=8)
        tk.Label(risk, text="สถานะข้อมูล", font=("Segoe UI", 10, "bold"), foreground="#7A4800", background="#FFF5E5").pack(side=tk.LEFT)
        tk.Label(risk, text=self.dashboard_message, font=("Segoe UI", 10), foreground="#7A4800", background="#FFF5E5").pack(side=tk.LEFT, padx=12)
        tk.Button(risk, text="จัดการตอนนี้", command=lambda: self.show_page("ตรวจเวลา"), font=("Segoe UI", 9, "bold"), foreground="#9C5A00", background="#FFF5E5", activebackground="#FFF5E5", relief=tk.FLAT, cursor="hand2").pack(side=tk.RIGHT, padx=12)

        metrics = tk.Frame(self.content, background="#F5F8FB")
        metrics.pack(fill=tk.X, padx=28)
        attendance_value = f"{self.dashboard.present}/{self.dashboard.total_employees}" if self.dashboard_live else "—"
        self._command_metric(metrics, "วันนี้มาทำงาน", attendance_value, "พนักงาน Check in แล้ว", "#146EF5", "ตรวจเวลา")
        self._command_metric(metrics, "เวลาที่ต้องดู", str(self.dashboard.exceptions) if self.dashboard_live else "—", "จัดการก่อนปิดรอบ", "#E06C3A", "ตรวจเวลา")
        self._command_metric(metrics, "เงินเดือนงวดนี้", "ดูจากรอบที่ล็อก", "ไม่แสดงยอดคาดเดา", "#6B5CE7", "เงินเดือน")
        self._command_metric(metrics, "บิลค้างรับ", f"฿{self.dashboard.overdue_invoices:,.2f}" if self.dashboard_live else "—", "ติดตามเงินเข้า", "#D64545", "ออกบิล")

        lower = tk.Frame(self.content, background="#F5F8FB")
        lower.pack(fill=tk.BOTH, expand=True, padx=28, pady=18)
        priorities = tk.Frame(lower, background="white", highlightbackground="#E3EAF2", highlightthickness=1)
        priorities.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))
        tk.Label(priorities, text="คิวงานที่ต้องตัดสินใจ", font=("Segoe UI", 14, "bold"), foreground="#172B4D", background="white").pack(anchor="w", padx=18, pady=(16, 2))
        tk.Label(priorities, text="เรียงตามผลกระทบต่อเงินและการปิดรอบ", font=("Segoe UI", 9), foreground="#627D98", background="white").pack(anchor="w", padx=18, pady=(0, 8))
        self._priority_row(priorities, "ด่วน", f"งานรออนุมัติ {self.dashboard.pending_approvals if self.dashboard_live else '—'} รายการ", "ลา, OT และแก้ไขเวลา", "ตรวจเวลา", "#D64545")
        self._priority_row(priorities, "ด่วน", f"บิลค้างรับ ฿{self.dashboard.overdue_invoices:,.2f}" if self.dashboard_live else "ยังไม่ได้เชื่อมข้อมูลบิล", "ตรวจข้อมูลจากระบบกลางก่อนติดตาม", "ออกบิล", "#D64545")
        self._priority_row(priorities, "ควรทำ", f"รอบล่าสุด: {self.dashboard.latest_payroll_id or 'ยังไม่มีรอบล็อก'}" if self.dashboard_live else "ตรวจเงินเดือนจากรอบที่ล็อก", f"สถานะ {self.dashboard.latest_payroll_status}" if self.dashboard.latest_payroll_status else "ใช้ Gross-pay snapshot เท่านั้น", "เงินเดือน", "#E68A00")
        pulse = tk.Frame(lower, background="#102A43", width=270)
        pulse.pack(side=tk.RIGHT, fill=tk.Y, padx=(8, 0))
        pulse.pack_propagate(False)
        tk.Label(pulse, text="OPERATION PULSE", font=("Segoe UI", 9, "bold"), foreground="#9FB3C8", background="#102A43").pack(anchor="w", padx=20, pady=(18, 5))
        tk.Label(pulse, text="LIVE" if self.dashboard_live else "WAIT", font=("Segoe UI", 30, "bold"), foreground="white", background="#102A43").pack(anchor="w", padx=20)
        tk.Label(pulse, text="Data connection state", font=("Segoe UI", 10), foreground="#C5D4E3", background="#102A43").pack(anchor="w", padx=20)
        canvas = tk.Canvas(pulse, width=214, height=8, background="#243B53", highlightthickness=0)
        canvas.pack(anchor="w", padx=20, pady=(14, 8))
        canvas.create_rectangle(0, 0, 214 if self.dashboard_live else 54, 8, fill="#29C28A" if self.dashboard_live else "#F6C453", width=0)
        tk.Label(pulse, text="ข้อมูลจริงพร้อมใช้งาน" if self.dashboard_live else "เชื่อม API ก่อนใช้ตัวเลข\nตัดสินใจ", justify=tk.LEFT, font=("Segoe UI", 10), foreground="#C5D4E3", background="#102A43").pack(anchor="w", padx=20, pady=(4, 18))
        tk.Button(pulse, text="ออกบิลใหม่", command=lambda: self.show_page("ออกบิล"), font=("Segoe UI", 10, "bold"), foreground="#102A43", background="#F6C453", activebackground="#E9B640", relief=tk.FLAT, padx=14, pady=8, cursor="hand2").pack(anchor="w", padx=20)

    def _refresh_dashboard(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not token:
            messagebox.showwarning("BVN Package", "ต้องตั้งค่า endpoint และ Windows environment variable BVN_ADMIN_TOKEN ก่อน")
            return
        try:
            self.dashboard = fetch_live_dashboard(endpoint, token)
        except RuntimeError as error:
            self.dashboard_live = False; self.dashboard_message = f"ดึงข้อมูลไม่สำเร็จ: {error}"
            self.show_page("วันนี้")
            return
        self.dashboard_live = True; self.dashboard_message = "ข้อมูลจากระบบกลางล่าสุด"
        self.show_page("วันนี้")

    def _table(self, columns: tuple[str, ...], rows: tuple[tuple[str, ...], ...]) -> ttk.Treeview:
        table = ttk.Treeview(self.content, columns=columns, show="headings", height=14)
        for column in columns:
            table.heading(column, text=column)
            table.column(column, width=170, minwidth=110)
        for row in rows:
            table.insert("", tk.END, values=row)
        table.pack(fill=tk.BOTH, expand=True, padx=34, pady=(0, 26))
        return table

    def _employee_page(self) -> None:
        header = self._header("พนักงาน", "Admin เป็นผู้สร้างบัญชี กำหนดสถานะ และตั้งนโยบาย Location รายบุคคล")
        tk.Button(header, text="+ สร้างบัญชีพนักงาน", command=self._new_employee_dialog, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)
        tk.Button(header, text="รีเซ็ตรหัสชั่วคราว", command=self._reset_password_dialog, background="#FFFFFF", foreground="#102A43", relief=tk.GROOVE, padx=12, pady=8).pack(side=tk.RIGHT, padx=(0, 8))
        tk.Button(header, text="รีเฟรชรายชื่อ", command=self._refresh_employees, background="#FFFFFF", foreground="#102A43", relief=tk.GROOVE, padx=12, pady=8).pack(side=tk.RIGHT, padx=(0, 8))
        notice = tk.Frame(self.content, background="#E8F1FF", highlightbackground="#B9D2FF", highlightthickness=1)
        notice.pack(fill=tk.X, padx=34, pady=(0, 14))
        tk.Label(notice, text="สิทธิ์ Location", font=("Segoe UI", 10, "bold"), foreground="#102A43", background="#E8F1FF").pack(side=tk.LEFT, padx=(14, 8), pady=10)
        tk.Label(notice, text="เปิด = ต้องส่ง GPS และอยู่ในรัศมีไซต์  |  ปิด = ลงเวลาได้โดยไม่ร้องขอพิกัด (บันทึก audit ว่า no-location)", font=("Segoe UI", 9), foreground="#334E68", background="#E8F1FF").pack(side=tk.LEFT, pady=10)
        rows = tuple((employee.employee_id, employee.name, employee.role, employee.status) for employee in self.dashboard.employee_rows)
        table = self._table(("รหัสพนักงาน", "ชื่อ", "ตำแหน่ง", "สถานะ"), rows)
        table.bind("<Button-3>", self._employee_context_menu)

    def _employee_context_menu(self, event: tk.Event) -> None:
        table = event.widget
        item = table.identify_row(event.y)
        if not item:
            return
        table.selection_set(item)
        employee_id = str(table.item(item, "values")[0])
        menu = tk.Menu(self, tearoff=False)
        menu.add_command(label="แก้ไขพนักงาน", command=lambda: self._edit_employee_dialog(employee_id))
        menu.add_separator()
        menu.add_command(label="ปิดใช้งานพนักงาน (ไม่ลบประวัติ)", command=lambda: self._deactivate_employee(employee_id))
        menu.tk_popup(event.x_root, event.y_root)

    def _refresh_employees(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        admin_token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not admin_token:
            messagebox.showwarning("BVN Package", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนรีเฟรชรายชื่อ")
            return
        try:
            data = call_admin_api(endpoint, admin_token, "admin_list_employees").get("data") or {}
            rows = [row for row in data.get("employees", []) if isinstance(row, dict)]
            self.employee_details = {str(row.get("id", "")): row for row in rows}
            employees = tuple(Employee(str(row.get("id", "")), str(row.get("name", "")), str(row.get("role", "")), str(row.get("status", "")).title()) for row in rows)
            self.dashboard = replace(self.dashboard, total_employees=len([row for row in employees if row.status.lower() == "active"]), employee_rows=employees)
        except RuntimeError as error:
            messagebox.showerror("รายชื่อพนักงาน", str(error))
            return
        self.show_page("ทีมงาน")

    def _edit_employee_dialog(self, employee_id: str) -> None:
        employee = self.employee_details.get(employee_id)
        if not employee:
            messagebox.showwarning("BVN Package", "กดรีเฟรชรายชื่อก่อนแก้ไข เพื่อดึงข้อมูลจริงจากระบบ")
            return
        endpoint = self.config_data["apps_script_endpoint"].strip()
        token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not token:
            messagebox.showwarning("BVN Package", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนแก้ไข")
            return
        dialog = tk.Toplevel(self); dialog.title("แก้ไขพนักงาน | BVN Package"); dialog.transient(self); dialog.grab_set(); dialog.configure(background="#F5F8FB")
        form = tk.Frame(dialog, background="#F5F8FB"); form.pack(padx=28, pady=24)
        values = {"name": tk.StringVar(value=str(employee.get("name", ""))), "role": tk.StringVar(value=str(employee.get("role", "Employee"))), "site": tk.StringVar(value=str(employee.get("siteId", "BVN-HQ")))}
        location_required = tk.BooleanVar(value=employee.get("locationRequired") is not False)
        tk.Label(form, text=f"Employee ID: {employee_id} (แก้ไขไม่ได้)", font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=0, column=0, sticky="w", pady=(0, 12))
        for row, (label, key) in enumerate((("ชื่อ-นามสกุล *", "name"), ("ตำแหน่ง", "role"), ("รหัสไซต์ *", "site"))):
            tk.Label(form, text=label, font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=row * 2 + 1, column=0, sticky="w")
            tk.Entry(form, textvariable=values[key], width=44).grid(row=row * 2 + 2, column=0, sticky="ew", pady=(2, 10))
        tk.Checkbutton(form, text="บังคับตรวจ Location / รัศมีไซต์", variable=location_required, background="#F5F8FB", foreground="#172B4D", activebackground="#F5F8FB").grid(row=7, column=0, sticky="w", pady=(0, 14))
        def save() -> None:
            try:
                call_admin_api(endpoint, token, "admin_upsert_employee", employeeId=employee_id, name=values["name"].get().strip(), role=values["role"].get().strip(), siteId=values["site"].get().strip(), status=str(employee.get("status", "active")), locationRequired=location_required.get())
            except RuntimeError as error:
                messagebox.showerror("แก้ไขพนักงาน", str(error), parent=dialog); return
            dialog.destroy(); self._refresh_employees()
        actions = tk.Frame(form, background="#F5F8FB"); actions.grid(row=8, column=0, sticky="e")
        tk.Button(actions, text="ยกเลิก", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="บันทึกการแก้ไข", command=save, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _deactivate_employee(self, employee_id: str) -> None:
        employee = self.employee_details.get(employee_id)
        if not employee:
            messagebox.showwarning("BVN Package", "กดรีเฟรชรายชื่อก่อนปิดใช้งานพนักงาน")
            return
        if not messagebox.askyesno("ปิดใช้งานพนักงาน", f"ยืนยันปิดใช้งาน {employee.get('name', employee_id)}?\n\nระบบจะเก็บประวัติเวลาและเงินเดือนไว้ แต่ไม่อนุญาตให้ล็อกอินใหม่"):
            return
        try:
            call_admin_api(self.config_data["apps_script_endpoint"].strip(), os.environ.get("BVN_ADMIN_TOKEN", "").strip(), "admin_upsert_employee", employeeId=employee_id, name=str(employee.get("name", "")), role=str(employee.get("role", "Employee")), siteId=str(employee.get("siteId", "BVN-HQ")), status="inactive", locationRequired=employee.get("locationRequired") is not False)
        except RuntimeError as error:
            messagebox.showerror("ปิดใช้งานพนักงาน", str(error)); return
        self._refresh_employees()

    def _new_employee_dialog(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        admin_token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not admin_token:
            messagebox.showwarning("BVN Package", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนสร้างบัญชี")
            return
        dialog = tk.Toplevel(self)
        dialog.title("สร้างบัญชีพนักงาน | BVN Package")
        dialog.transient(self)
        dialog.grab_set()
        dialog.configure(background="#F5F8FB")
        form = tk.Frame(dialog, background="#F5F8FB")
        form.pack(padx=28, pady=24)
        values = {key: tk.StringVar() for key in ("name", "role", "site")}
        values["role"].set("Employee")
        values["site"].set("BVN-HQ")
        location_required = tk.BooleanVar(value=True)
        tk.Label(form, text="ระบบจะออก Employee ID และรหัสผ่านชั่วคราวให้อัตโนมัติ", font=("Segoe UI", 9), foreground="#627D98", background="#F5F8FB").grid(row=0, column=0, sticky="w", pady=(0, 12))
        for row, (label, key) in enumerate((("ชื่อ-นามสกุล *", "name"), ("ตำแหน่ง", "role"), ("รหัสไซต์ *", "site"))):
            tk.Label(form, text=label, font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=row * 2, column=0, sticky="w")
            tk.Entry(form, textvariable=values[key], width=44).grid(row=row * 2 + 1, column=0, sticky="ew", pady=(2, 12))
        tk.Checkbutton(form, text="บังคับตรวจ Location / รัศมีไซต์", variable=location_required, background="#F5F8FB", foreground="#172B4D", activebackground="#F5F8FB").grid(row=6, column=0, sticky="w", pady=(0, 10))
        tk.Label(form, text="ปิดได้เฉพาะพนักงานที่ได้รับอนุญาต เช่น ฝ่ายขายหรือ WFH", font=("Segoe UI", 9), foreground="#627D98", background="#F5F8FB").grid(row=7, column=0, sticky="w", pady=(0, 14))

        def create() -> None:
            try:
                result = call_admin_api(endpoint, admin_token, "admin_upsert_employee", name=values["name"].get().strip(), role=values["role"].get().strip(), siteId=values["site"].get().strip(), status="active", locationRequired=location_required.get())
                data = result.get("data") or {}; employee_id = str((data.get("employee") or {}).get("id") or ""); password = str(data.get("initialPassword") or "")
                if not employee_id or not password: raise RuntimeError("ระบบออก ID หรือรหัสผ่านชั่วคราวไม่สำเร็จ")
            except RuntimeError as error:
                messagebox.showerror("สร้างบัญชีพนักงาน", str(error), parent=dialog)
                return
            dialog.destroy()
            messagebox.showinfo("สร้างบัญชีสำเร็จ", "ส่งข้อมูลนี้ให้พนักงานเพียงครั้งเดียว\nอย่าเก็บรหัสผ่านในแชตหรือเอกสารสาธารณะ:\n\nEmployee ID: " + employee_id + "\nรหัสผ่านชั่วคราว: " + password, parent=self)
            self.show_page("ทีมงาน")

        actions = tk.Frame(form, background="#F5F8FB")
        actions.grid(row=8, column=0, sticky="e")
        tk.Button(actions, text="ยกเลิก", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="สร้างบัญชีและออกรหัสชั่วคราว", command=create, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _reset_password_dialog(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        admin_token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not admin_token:
            messagebox.showwarning("BVN Package", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนรีเซ็ตรหัส")
            return
        dialog = tk.Toplevel(self)
        dialog.title("รีเซ็ตรหัสผ่านชั่วคราว | BVN Package")
        dialog.transient(self)
        dialog.grab_set()
        dialog.configure(background="#F5F8FB")
        form = tk.Frame(dialog, background="#F5F8FB")
        form.pack(padx=28, pady=24)
        employee_id = tk.StringVar()
        tk.Label(form, text="Employee ID", font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").pack(anchor="w")
        tk.Entry(form, textvariable=employee_id, width=38).pack(fill=tk.X, pady=(4, 10))
        tk.Label(form, text="ระบบจะแสดงรหัสใหม่เพียงครั้งเดียว ไม่สามารถดูรหัสเดิมได้", font=("Segoe UI", 9), foreground="#627D98", background="#F5F8FB", wraplength=300, justify=tk.LEFT).pack(anchor="w", pady=(0, 16))
        def reset() -> None:
            try:
                data = call_admin_api(endpoint, admin_token, "admin_reset_employee_password", employeeId=employee_id.get().strip()).get("data") or {}
                password = str(data.get("temporaryPassword") or "")
                if not password:
                    raise RuntimeError("ระบบออกรหัสผ่านชั่วคราวไม่สำเร็จ")
            except RuntimeError as error:
                messagebox.showerror("รีเซ็ตรหัสผ่าน", str(error), parent=dialog)
                return
            dialog.destroy()
            messagebox.showinfo("รหัสผ่านชั่วคราวใหม่", "ส่งให้พนักงานเพียงครั้งเดียว\nอย่าเก็บรหัสผ่านในแชตหรือเอกสารสาธารณะ:\n\nEmployee ID: " + employee_id.get().strip().upper() + "\nรหัสผ่านชั่วคราว: " + password, parent=self)
        actions = tk.Frame(form, background="#F5F8FB")
        actions.pack(anchor="e")
        tk.Button(actions, text="ยกเลิก", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="รีเซ็ตรหัส", command=reset, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _attendance_page(self) -> None:
        header = self._header("ตรวจเวลา", "ตรวจสอบเวลาเข้าออก และจัดการข้อยกเว้นก่อนปิดรอบ")
        tk.Button(header, text="เปิดงานรออนุมัติ", command=self._approval_queue_dialog, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)
        rows = tuple((entry.employee, entry.reason, entry.occurred_at, entry.status) for entry in self.dashboard.exception_rows)
        self._table(("พนักงาน", "เหตุผล", "เวลา", "สถานะ"), rows)

    def _approval_queue_dialog(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not token:
            messagebox.showwarning("BVN Package", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนเปิดงานรออนุมัติ")
            return
        try:
            leave_data = call_admin_api(endpoint, token, "admin_list_leave_requests").get("data") or {}
            time_data = call_admin_api(endpoint, token, "admin_list_time_requests").get("data") or {}
            requests = []
            requests.extend({"source": "leave", **row} for row in leave_data.get("requests", []) if isinstance(row, dict))
            requests.extend({"source": "time", **row} for row in time_data.get("requests", []) if isinstance(row, dict))
        except RuntimeError as error:
            messagebox.showerror("งานรออนุมัติ", str(error)); return
        dialog = tk.Toplevel(self); dialog.title("งานรออนุมัติ | BVN Package"); dialog.transient(self); dialog.grab_set(); dialog.geometry("1060x500"); dialog.configure(background="#F5F8FB")
        tk.Label(dialog, text="งานรออนุมัติ", font=("Segoe UI", 16, "bold"), foreground="#172B4D", background="#F5F8FB").pack(anchor="w", padx=24, pady=(22, 6))
        tk.Label(dialog, text="ลา, OT และแก้ไขเวลาอยู่ในคิวเดียวกัน — อนุมัติเฉพาะ Pending และบันทึกชื่อผู้ตัดสินใจทุกครั้ง", font=("Segoe UI", 9), foreground="#627D98", background="#F5F8FB").pack(anchor="w", padx=24, pady=(0, 12))
        columns = ("รหัสคำขอ", "พนักงาน", "งาน", "วัน/ช่วงเวลา", "สถานะ", "รายละเอียด")
        table = ttk.Treeview(dialog, columns=columns, show="headings", height=12)
        for column in columns: table.heading(column, text=column); table.column(column, width=135, minwidth=95)
        request_index: dict[str, dict[str, object]] = {}
        for row in requests:
            request_id = str(row.get("requestId", "")); request_index[request_id] = row
            if row.get("source") == "leave":
                title, when = f"ลา: {row.get('leaveType', '')}", f"{row.get('startDate', '')} ถึง {row.get('endDate', '')}"
            else:
                request_type = "OT" if row.get("requestType") == "overtime" else "แก้ไขเวลา"
                title, when = request_type, f"{row.get('workDate', '')} • {row.get('requestedMinutes', 0)} นาที"
            table.insert("", tk.END, values=(request_id, row.get("employeeId", ""), title, when, row.get("status", ""), row.get("reason", "")))
        table.pack(fill=tk.BOTH, expand=True, padx=24, pady=(0, 12))
        tk.Label(dialog, text="หมายเหตุถึงพนักงาน (แนะนำเมื่อปฏิเสธ)", font=("Segoe UI", 9), foreground="#627D98", background="#F5F8FB").pack(anchor="w", padx=24, pady=(0, 8))
        reviewer_note = tk.StringVar()
        tk.Entry(dialog, textvariable=reviewer_note, width=72).pack(anchor="w", padx=24, pady=(0, 10))
        def decide(decision: str) -> None:
            selected = table.selection()
            if not selected: messagebox.showwarning("งานรออนุมัติ", "เลือกรายการก่อน", parent=dialog); return
            values = table.item(selected[0], "values"); request_id, status = str(values[0]), str(values[4]).lower()
            if status != "pending": messagebox.showwarning("งานรออนุมัติ", "รายการนี้ถูกตัดสินใจแล้ว", parent=dialog); return
            if decision == "rejected" and not reviewer_note.get().strip(): messagebox.showwarning("งานรออนุมัติ", "ระบุเหตุผลเมื่อปฏิเสธ เพื่อให้พนักงานแก้ไขได้", parent=dialog); return
            if not messagebox.askyesno("ยืนยันการตัดสินใจ", f"ยืนยัน {('อนุมัติ' if decision == 'approved' else 'ปฏิเสธ')} รายการนี้?", parent=dialog): return
            request = request_index.get(request_id, {})
            try:
                if request.get("source") == "leave": call_admin_api(endpoint, token, "admin_review_leave", requestId=request_id, decision=decision, reviewer="Admin")
                else: call_admin_api(endpoint, token, "admin_review_time_request", requestId=request_id, decision=decision, reviewer="Admin", reviewerNote=reviewer_note.get().strip())
            except RuntimeError as error: messagebox.showerror("งานรออนุมัติ", str(error), parent=dialog); return
            dialog.destroy(); self._approval_queue_dialog()
        actions = tk.Frame(dialog, background="#F5F8FB"); actions.pack(anchor="e", padx=24, pady=(0, 20))
        tk.Button(actions, text="ปิด", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="ปฏิเสธ", command=lambda: decide("rejected"), background="#D64545", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="อนุมัติ", command=lambda: decide("approved"), background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _ledger_page(self, title: str, amount: str, status: str) -> None:
        header = self._header(title, "ตั้งค่าค่าแรงก่อนเปิดรอบ แล้วตรวจทานก่อนอนุมัติจ่าย")
        tk.Button(header, text="ตั้งค่าค่าแรงพนักงาน", command=self._pay_rule_dialog, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)
        tk.Button(header, text="Preview รอบเงินเดือน", command=self._payroll_preview_dialog, background="#0B8F62", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT, padx=(0, 8))
        tk.Button(header, text="รอบที่ล็อกแล้ว", command=self._payroll_history_dialog, background="#5C6F82", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT, padx=(0, 8))
        panel = tk.Frame(self.content, background="white", highlightbackground="#D9E2EC", highlightthickness=1)
        panel.pack(fill=tk.X, padx=34, pady=8)
        tk.Label(panel, text=amount, font=("Segoe UI", 30, "bold"), foreground="#172B4D", background="white").pack(anchor="w", padx=22, pady=(20, 4))
        tk.Label(panel, text=status, font=("Segoe UI", 11), foreground="#E68A00", background="white").pack(anchor="w", padx=22, pady=(0, 20))
        tk.Label(panel, text="ยอดในหน้านี้ยังไม่ใช่ยอดจ่ายจริง ใช้ Preview เพื่อสร้างยอดจากเวลาที่อนุมัติแล้ว", font=("Segoe UI", 9), foreground="#627D98", background="white").pack(anchor="w", padx=22, pady=(0, 20))

    def _payroll_history_dialog(self) -> None:
        endpoint, token = self.config_data["apps_script_endpoint"].strip(), os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not token:
            messagebox.showwarning("รอบเงินเดือน", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนเปิดประวัติรอบเงินเดือน"); return
        try:
            data = call_admin_api(endpoint, token, "admin_list_payrolls").get("data") or {}
            periods = [row for row in data.get("periods", []) if isinstance(row, dict)]
        except RuntimeError as error:
            messagebox.showerror("รอบเงินเดือน", str(error)); return
        dialog = tk.Toplevel(self); dialog.title("รอบเงินเดือนที่ล็อกแล้ว | BVN Package"); dialog.transient(self); dialog.grab_set(); dialog.geometry("930x520"); dialog.configure(background="#F5F8FB")
        tk.Label(dialog, text="รอบเงินเดือนที่ล็อกแล้ว", font=("Segoe UI", 16, "bold"), foreground="#172B4D", background="#F5F8FB").pack(anchor="w", padx=24, pady=(22, 4))
        tk.Label(dialog, text="Export ได้จาก snapshot ที่ล็อกแล้วเท่านั้น — ไม่ใช่ไฟล์จ่ายเงินจริง", font=("Segoe UI", 9), foreground="#A15C00", background="#FFF5DE", padx=10, pady=7).pack(fill=tk.X, padx=24, pady=(0, 12))
        columns = ("Payroll ID", "เริ่มรอบ", "สิ้นสุดรอบ", "สถานะ", "ล็อกโดย", "เวลาล็อก")
        table = ttk.Treeview(dialog, columns=columns, show="headings", height=12)
        for column, width in zip(columns, (170, 110, 110, 90, 130, 210), strict=True): table.heading(column, text=column); table.column(column, width=width, minwidth=80)
        for row in periods: table.insert("", tk.END, values=(row.get("payrollId", ""), row.get("startDate", ""), row.get("endDate", ""), row.get("status", ""), row.get("lockedBy", ""), row.get("lockedAt", "")))
        table.pack(fill=tk.BOTH, expand=True, padx=24, pady=(0, 10))
        def export_snapshot() -> None:
            selected = table.selection()
            if not selected: messagebox.showwarning("Export payroll", "เลือกรอบเงินเดือนก่อน", parent=dialog); return
            payroll_id = str(table.item(selected[0], "values")[0])
            try:
                data = call_admin_api(endpoint, token, "admin_get_payroll", payrollId=payroll_id).get("data") or {}
                lines = [row for row in data.get("lines", []) if isinstance(row, dict)]
            except RuntimeError as error:
                messagebox.showerror("Export payroll", str(error), parent=dialog); return
            target = APP_DIR / f"{payroll_id}_gross_pay_snapshot.csv"
            try:
                with target.open("w", newline="", encoding="utf-8-sig") as handle:
                    writer = csv.writer(handle); writer.writerow(["Payroll ID", "Employee ID", "Regular minutes", "OT minutes", "Base gross", "OT gross", "Gross pay"])
                    for row in lines: writer.writerow([payroll_id, row.get("employeeId", ""), row.get("regularMinutes", 0), row.get("otMinutes", 0), row.get("baseGross", 0), row.get("otGross", 0), row.get("grossPay", 0)])
            except OSError as error:
                messagebox.showerror("Export payroll", f"บันทึกไฟล์ไม่ได้: {error}", parent=dialog); return
            messagebox.showinfo("Export payroll", f"สร้าง CSV จาก snapshot ที่ล็อกแล้ว\n{target}", parent=dialog)
        actions = tk.Frame(dialog, background="#F5F8FB"); actions.pack(anchor="e", padx=24, pady=(0, 18))
        tk.Button(actions, text="ปิด", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="Export CSV snapshot", command=export_snapshot, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _payroll_preview_dialog(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        admin_token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not admin_token:
            messagebox.showwarning("Payroll", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนเปิดรอบเงินเดือน")
            return
        today = date.today(); first_day = today.replace(day=1)
        dialog = tk.Toplevel(self); dialog.title("Preview รอบเงินเดือน | BVN Package"); dialog.transient(self); dialog.grab_set(); dialog.geometry("1060x600"); dialog.configure(background="#F5F8FB")
        filters = tk.Frame(dialog, background="#F5F8FB"); filters.pack(fill=tk.X, padx=24, pady=(22, 8))
        start, end = tk.StringVar(value=first_day.isoformat()), tk.StringVar(value=today.isoformat())
        for column, (label, variable) in enumerate((("เริ่มรอบ (YYYY-MM-DD)", start), ("สิ้นสุดรอบ (YYYY-MM-DD)", end))):
            tk.Label(filters, text=label, font=("Segoe UI", 9, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=0, column=column, sticky="w", padx=(0, 12))
            tk.Entry(filters, textvariable=variable, width=20).grid(row=1, column=column, sticky="w", padx=(0, 12), pady=(3, 0))
        tk.Label(dialog, text="Gross-pay preview: ใช้เฉพาะเวลา accepted ที่เข้า/ออกครบ และ OT ที่อนุมัติแล้ว — ไม่รวมภาษี, SSO, หักเงิน หรือการจ่ายเงินจริง", font=("Segoe UI", 9), foreground="#A15C00", background="#FFF5DE", padx=12, pady=8).pack(fill=tk.X, padx=24, pady=(0, 10))
        columns = ("พนักงาน", "วันทำงาน", "นาทีปกติ", "นาที OT", "ฐาน", "OT", "ยอด Gross", "คำเตือน")
        table = ttk.Treeview(dialog, columns=columns, show="headings", height=14)
        for column, width in zip(columns, (110, 85, 90, 80, 110, 100, 115, 280), strict=True): table.heading(column, text=column); table.column(column, width=width, minwidth=70, anchor=tk.W if column in ("พนักงาน", "คำเตือน") else tk.E)
        table.pack(fill=tk.BOTH, expand=True, padx=24, pady=(0, 10))
        total = tk.StringVar(value="กด Preview เพื่อคำนวณ")
        tk.Label(dialog, textvariable=total, font=("Segoe UI", 12, "bold"), foreground="#172B4D", background="#F5F8FB").pack(anchor="w", padx=24)
        preview_data: dict[str, object] = {}

        def preview() -> None:
            nonlocal preview_data
            try:
                data = call_admin_api(endpoint, admin_token, "admin_preview_payroll", startDate=start.get().strip(), endDate=end.get().strip()).get("data") or {}
            except RuntimeError as error:
                messagebox.showerror("Payroll Preview", str(error), parent=dialog); return
            if not isinstance(data, dict): messagebox.showerror("Payroll Preview", "รูปแบบข้อมูลไม่ถูกต้อง", parent=dialog); return
            preview_data = data
            table.delete(*table.get_children())
            for row in data.get("lines", []):
                if not isinstance(row, dict): continue
                table.insert("", tk.END, values=(row.get("employeeId", ""), row.get("workDays", 0), row.get("regularMinutes", 0), row.get("otMinutes", 0), f"฿{float(row.get('baseGross', 0)):,.2f}", f"฿{float(row.get('otGross', 0)):,.2f}", f"฿{float(row.get('grossPay', 0)):,.2f}", "; ".join(row.get("warnings", []))))
            total.set(f"ยอด Gross ทั้งรอบ: ฿{float(data.get('totalGross', 0)):,.2f}  •  {len(data.get('lines', []))} พนักงาน")

        def lock_period() -> None:
            if not preview_data:
                messagebox.showwarning("Payroll", "กด Preview และตรวจยอดก่อนล็อกรอบ", parent=dialog); return
            if not messagebox.askyesno("ล็อกรอบเงินเดือน", "ยืนยันล็อกรอบนี้? หลังล็อกจะสร้าง snapshot ยอด Gross และไม่สามารถล็อกซ้ำได้", parent=dialog): return
            try:
                data = call_admin_api(endpoint, admin_token, "admin_lock_payroll", startDate=start.get().strip(), endDate=end.get().strip(), lockedBy="Admin").get("data") or {}
            except RuntimeError as error:
                messagebox.showerror("ล็อกรอบเงินเดือน", str(error), parent=dialog); return
            messagebox.showinfo("ล็อกรอบเงินเดือน", f"ล็อกรอบ {data.get('payrollId', '')} แล้ว\nยอด Gross: ฿{float(data.get('totalGross', 0)):,.2f}\n\nยังไม่ใช่การจ่ายเงินจริง", parent=dialog)
            dialog.destroy()
        actions = tk.Frame(dialog, background="#F5F8FB"); actions.pack(anchor="e", padx=24, pady=16)
        tk.Button(actions, text="ปิด", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="ล็อกรอบ", command=lock_period, background="#0B8F62", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="Preview", command=preview, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _pay_rule_dialog(self) -> None:
        endpoint = self.config_data["apps_script_endpoint"].strip()
        admin_token = os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if not endpoint or not admin_token:
            messagebox.showwarning("BVN Package", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนตั้งค่าค่าแรง")
            return
        dialog = tk.Toplevel(self)
        dialog.title("ตั้งค่าค่าแรง | BVN Package")
        dialog.transient(self); dialog.grab_set(); dialog.configure(background="#F5F8FB")
        form = tk.Frame(dialog, background="#F5F8FB"); form.pack(padx=28, pady=24)
        values = {key: tk.StringVar() for key in ("employee_id", "rate", "hours", "ot_multiplier", "premium_date", "premium_multiplier")}
        values["hours"].set("8"); values["ot_multiplier"].set("1.5"); values["premium_multiplier"].set("1")
        basis = tk.StringVar(value="daily"); ot_enabled = tk.BooleanVar(value=True)
        for row, (label, key) in enumerate((("รหัสพนักงาน *", "employee_id"), ("ค่าแรง *", "rate"), ("ชั่วโมงงานปกติ/วัน", "hours"), ("OT คูณ", "ot_multiplier"), ("วันที่เพิ่มค่าแรง (YYYY-MM-DD)", "premium_date"), ("เพิ่มค่าแรงคูณ", "premium_multiplier"))):
            tk.Label(form, text=label, font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=row * 2, column=0, sticky="w")
            tk.Entry(form, textvariable=values[key], width=42).grid(row=row * 2 + 1, column=0, sticky="ew", pady=(2, 10))
        tk.Label(form, text="รูปแบบค่าแรง", font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=12, column=0, sticky="w")
        tk.Radiobutton(form, text="รายวัน", value="daily", variable=basis, background="#F5F8FB").grid(row=13, column=0, sticky="w")
        tk.Radiobutton(form, text="รายชั่วโมง", value="hourly", variable=basis, background="#F5F8FB").grid(row=14, column=0, sticky="w")
        tk.Checkbutton(form, text="เปิดใช้ OT", variable=ot_enabled, background="#F5F8FB").grid(row=15, column=0, sticky="w", pady=(4, 14))

        def save_rule() -> None:
            try:
                result = call_admin_api(endpoint, admin_token, "admin_upsert_pay_rule", employeeId=values["employee_id"].get().strip(), payBasis=basis.get(), baseRate=float(values["rate"].get().replace(',', '')), standardHours=float(values["hours"].get()), otEnabled=ot_enabled.get(), otMultiplier=float(values["ot_multiplier"].get()), premiumDate=values["premium_date"].get().strip(), premiumMultiplier=float(values["premium_multiplier"].get()), updatedBy="Admin")
            except (ValueError, RuntimeError) as error:
                messagebox.showerror("ตั้งค่าค่าแรง", "ตรวจสอบข้อมูล: " + str(error), parent=dialog); return
            dialog.destroy(); messagebox.showinfo("ตั้งค่าค่าแรง", "บันทึกกฎค่าแรงของ " + str((result.get("data") or {}).get("employeeId", "พนักงาน")) + " แล้ว", parent=self)

        actions = tk.Frame(form, background="#F5F8FB"); actions.grid(row=16, column=0, sticky="e")
        tk.Button(actions, text="ยกเลิก", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="บันทึกกฎค่าแรง", command=save_rule, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _invoice_page(self) -> None:
        header = self._header("ออกบิล", "สร้างร่างบิล ตรวจยอด และติดตามสถานะการชำระ")
        tk.Button(header, text="+ ออกบิลใหม่", command=self._new_invoice_dialog, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)
        endpoint, token = self.config_data["apps_script_endpoint"].strip(), os.environ.get("BVN_ADMIN_TOKEN", "").strip()
        if endpoint and token:
            try:
                data = call_admin_api(endpoint, token, "admin_list_invoices").get("data") or {}
                self.invoices = [Invoice(str(row.get("invoiceNo", "")), str(row.get("customer", "")), str(row.get("description", "")), float(row.get("subtotal", 0)), float(row.get("vat", 0)), str(row.get("dueDate", "")), str(row.get("status", "draft"))) for row in data.get("invoices", []) if isinstance(row, dict)]
            except RuntimeError as error:
                messagebox.showwarning("ออกบิล", f"ยังดึงบิลจากระบบไม่ได้: {error}")
        overdue = sum(invoice.total for invoice in self.invoices if invoice.status == "overdue")
        draft = sum(invoice.total for invoice in self.invoices if invoice.status == "draft")
        cards = tk.Frame(self.content, background="#F5F8FB")
        cards.pack(fill=tk.X, padx=28)
        self._card(cards, "เกินกำหนด", f"฿{overdue:,.2f}", "ต้องติดตามทันที")
        self._card(cards, "ร่างบิล", f"฿{draft:,.2f}", "ตรวจสอบก่อนอนุมัติ")
        self._card(cards, "จำนวนเอกสาร", str(len(self.invoices)), "ข้อมูลจากระบบ" if endpoint and token else "ยังไม่เชื่อมระบบ")
        panel = tk.Frame(self.content, background="white", highlightbackground="#D9E2EC", highlightthickness=1)
        panel.pack(fill=tk.BOTH, expand=True, padx=34, pady=18)
        columns = ("เลขที่", "ลูกค้า", "รายละเอียด", "ก่อน VAT", "VAT 7%", "ยอดสุทธิ", "ครบกำหนด", "สถานะ")
        table = ttk.Treeview(panel, columns=columns, show="headings", height=13)
        widths = (125, 170, 180, 105, 95, 110, 105, 90)
        for column, width in zip(columns, widths, strict=True):
            table.heading(column, text=column)
            table.column(column, width=width, minwidth=75, anchor=tk.W if column in ("เลขที่", "ลูกค้า", "รายละเอียด") else tk.E)
        labels = {"draft": "ร่าง", "issued": "ออกแล้ว", "paid": "ชำระแล้ว", "void": "ยกเลิก", "overdue": "เกินกำหนด"}
        for invoice in self.invoices:
            table.insert("", tk.END, values=(invoice.invoice_no, invoice.customer, invoice.description, f"฿{invoice.subtotal:,.2f}", f"฿{invoice.vat:,.2f}", f"฿{invoice.total:,.2f}", invoice.due_date, labels.get(invoice.status, invoice.status)))
        table.pack(fill=tk.BOTH, expand=True, padx=16, pady=(16, 8))
        def update_status(status: str) -> None:
            selected = table.selection()
            if not selected:
                messagebox.showwarning("สถานะบิล", "เลือกบิลก่อน"); return
            invoice_no = str(table.item(selected[0], "values")[0])
            if not endpoint or not token:
                messagebox.showwarning("สถานะบิล", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนเปลี่ยนสถานะ"); return
            title = {"issued": "ออกบิล", "paid": "บันทึกรับชำระ", "void": "ยกเลิกบิล"}[status]
            if not messagebox.askyesno(title, f"ยืนยันเปลี่ยนสถานะ {invoice_no}?\nการเปลี่ยนสถานะจะบันทึกในระบบกลาง", parent=self): return
            payment_reference = ""
            if status == "paid":
                payment_reference = simpledialog.askstring("เลขอ้างอิงการรับชำระ", "กรอกเลขอ้างอิงโอนเงิน / เลขที่ใบเสร็จ:", parent=self) or ""
                if not payment_reference.strip():
                    messagebox.showwarning("รับชำระ", "ต้องระบุเลขอ้างอิงการรับชำระเพื่อให้ตรวจสอบย้อนหลังได้", parent=self); return
            try:
                call_admin_api(endpoint, token, "admin_update_invoice_status", invoiceNo=invoice_no, status=status, paymentReference=payment_reference)
            except RuntimeError as error:
                messagebox.showerror("สถานะบิล", str(error), parent=self); return
            self.show_page("ออกบิล")
        actions = tk.Frame(panel, background="white"); actions.pack(anchor="e", padx=16, pady=(0, 8))
        tk.Button(actions, text="ยกเลิกบิล", command=lambda: update_status("void"), background="#D64545", foreground="white", relief=tk.FLAT, padx=12, pady=7).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="รับชำระแล้ว", command=lambda: update_status("paid"), background="#0B8F62", foreground="white", relief=tk.FLAT, padx=12, pady=7).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="ออกบิลแล้ว", command=lambda: update_status("issued"), background="#146EF5", foreground="white", relief=tk.FLAT, padx=12, pady=7).pack(side=tk.RIGHT)
        tk.Label(panel, text="การสร้างและสถานะบิลต้องบันทึกผ่านระบบกลางเท่านั้น ไม่มีการเก็บเป็นบิลชั่วคราวในเครื่อง", font=("Segoe UI", 9), foreground="#627D98", background="white").pack(anchor="w", padx=18, pady=(0, 16))

    def _new_invoice_dialog(self) -> None:
        dialog = tk.Toplevel(self)
        dialog.title("ออกบิลใหม่ | BVN Package")
        dialog.transient(self)
        dialog.grab_set()
        dialog.configure(background="#F5F8FB")
        dialog.resizable(False, False)
        form = tk.Frame(dialog, background="#F5F8FB")
        form.pack(padx=28, pady=24)
        values: dict[str, tk.StringVar] = {key: tk.StringVar() for key in ("customer", "description", "amount", "due_days")}
        values["customer"].set("บริษัท พนมพร พาณิชย์ จำกัด")
        values["due_days"].set("30")
        tk.Label(form, text="ลูกค้าเริ่มต้น: Phanomporn Phanich Co.,Ltd | Tax ID 0105569911266", font=("Segoe UI", 9), foreground="#627D98", background="#F5F8FB").grid(row=0, column=0, sticky="w", pady=(0, 12))
        fields = (("ชื่อลูกค้า *", "customer"), ("รายการ/บริการ *", "description"), ("ยอดก่อน VAT *", "amount"), ("กำหนดชำระ (วัน)", "due_days"))
        for row, (label, key) in enumerate(fields, start=1):
            tk.Label(form, text=label, font=("Segoe UI", 10, "bold"), foreground="#172B4D", background="#F5F8FB").grid(row=row * 2 - 1, column=0, sticky="w", pady=(0, 5))
            tk.Entry(form, textvariable=values[key], width=42, font=("Segoe UI", 10)).grid(row=row * 2, column=0, sticky="ew", pady=(0, 14))
        preview = tk.StringVar(value="VAT 7%: ฿0.00   |   ยอดสุทธิ: ฿0.00")
        tk.Label(form, textvariable=preview, font=("Segoe UI", 10, "bold"), foreground="#0B8F62", background="#F5F8FB").grid(row=9, column=0, sticky="w", pady=(2, 16))

        def update_preview(*_args: object) -> None:
            try:
                amount = float(values["amount"].get().replace(",", ""))
                if amount < 0:
                    raise ValueError
            except ValueError:
                preview.set("กรอกยอดก่อน VAT เป็นตัวเลข 0 หรือมากกว่า")
                return
            vat = round(amount * 0.07, 2)
            preview.set(f"VAT 7%: ฿{vat:,.2f}   |   ยอดสุทธิ: ฿{amount + vat:,.2f}")

        values["amount"].trace_add("write", update_preview)

        def create_draft() -> None:
            customer, description = values["customer"].get().strip(), values["description"].get().strip()
            try:
                amount = round(float(values["amount"].get().replace(",", "")), 2)
                due_days = int(values["due_days"].get())
                if not customer or not description or amount < 0 or due_days < 0:
                    raise ValueError
            except ValueError:
                messagebox.showerror("ออกบิลใหม่", "กรอกลูกค้า รายการ ยอด และวันครบกำหนดให้ถูกต้อง", parent=dialog)
                return
            due = date.today() + timedelta(days=due_days)
            endpoint, token = self.config_data["apps_script_endpoint"].strip(), os.environ.get("BVN_ADMIN_TOKEN", "").strip()
            if not endpoint or not token:
                messagebox.showwarning("ออกบิลใหม่", "ตั้งค่า endpoint และ BVN_ADMIN_TOKEN ก่อนสร้างบิล", parent=dialog); return
            try:
                data = call_admin_api(endpoint, token, "admin_create_invoice", customer=customer, description=description, subtotal=amount, dueDate=due.isoformat()).get("data") or {}
                invoice = data.get("invoice") or {}; invoice_number = str(invoice.get("invoiceNo") or "")
                if not invoice_number: raise RuntimeError("ระบบไม่ออกเลขที่บิล")
            except RuntimeError as error:
                messagebox.showerror("ออกบิลใหม่", str(error), parent=dialog); return
            dialog.destroy()
            self.show_page("ออกบิล")
            messagebox.showinfo("BVN Package", f"สร้างร่างบิล {invoice_number} และบันทึกเข้าระบบแล้ว\nสถานะยังเป็น Draft — ยังไม่ถือว่าส่งหรือรับชำระ", parent=self)

        actions = tk.Frame(form, background="#F5F8FB")
        actions.grid(row=10, column=0, sticky="e")
        tk.Button(actions, text="ยกเลิก", command=dialog.destroy, relief=tk.FLAT, padx=12, pady=8).pack(side=tk.RIGHT, padx=(8, 0))
        tk.Button(actions, text="สร้างร่างบิล", command=create_draft, background="#146EF5", foreground="white", relief=tk.FLAT, padx=14, pady=8).pack(side=tk.RIGHT)

    def _settings_page(self) -> None:
        self._header("ตั้งค่าการเชื่อมต่อ", "ตั้งค่า endpoint เฉพาะหลัง Apps Script มี authentication แล้ว")
        panel = tk.Frame(self.content, background="white", highlightbackground="#D9E2EC", highlightthickness=1)
        panel.pack(fill=tk.X, padx=34, pady=8)
        tk.Label(panel, text="Google Apps Script endpoint", font=("Segoe UI", 11, "bold"), foreground="#172B4D", background="white").pack(anchor="w", padx=20, pady=(20, 6))
        value = tk.StringVar(value=self.config_data["apps_script_endpoint"])
        entry = tk.Entry(panel, textvariable=value, width=82, font=("Consolas", 10))
        entry.pack(fill=tk.X, padx=20)
        tk.Label(panel, text="ห้ามใส่ password หรือ API secret ในไฟล์นี้", font=("Segoe UI", 9), foreground="#627D98", background="white").pack(anchor="w", padx=20, pady=(6, 12))

        def save() -> None:
            CONFIG_PATH.write_text(json.dumps({"apps_script_endpoint": value.get().strip()}, indent=2), encoding="utf-8")
            self.config_data = load_config()
            messagebox.showinfo("BVN Package", "บันทึกการตั้งค่าแล้ว")

        tk.Button(panel, text="บันทึก", command=save, background="#146EF5", foreground="white", relief=tk.FLAT, padx=16, pady=8).pack(anchor="w", padx=20, pady=(0, 20))


if __name__ == "__main__":
    AdminApp().mainloop()
