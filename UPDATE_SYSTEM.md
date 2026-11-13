# ระบบอัปเดต/แพตช์เวอร์ชัน (แอป + หลังบ้าน)

ออกแบบให้ **ข้อมูลเวอร์ชันอยู่ในหลังบ้าน (Settings)** ส่วน **ไฟล์ APK อยู่บน Google Drive**
แอปเช็กผ่าน action `version` ที่มีอยู่แล้ว (public ไม่ต้องล็อกอิน) จึงไม่ต้องดึงไฟล์ JSON จาก Drive

Google Drive folder ที่ใช้เก็บไฟล์:
https://drive.google.com/drive/folders/1aF7Zj31-ah9xXsYBCXJzPn1EJKA-R7JP

---

## วิธีปล่อยแอปเวอร์ชันใหม่ (APK)

1. **Build APK** ใหม่ โดย**เพิ่มเลขเวอร์ชัน**ก่อน:
   - `employee_mobile/lib/update.dart` → แก้ `kAppVersionCode` (เช่น 1 → 2) และ `kAppVersionName`
   - `employee_mobile/pubspec.yaml` → `version: 1.0.1+2` (เลขหลัง + คือ versionCode ให้ตรงกับ `kAppVersionCode`)
   - `flutter build apk --release`
2. **อัปโหลด APK** ขึ้นโฟลเดอร์ Drive ด้านบน → คลิกขวา **แชร์ → ทุกคนที่มีลิงก์ (ผู้ดู)**
3. เอา File ID จากลิงก์แชร์ (`https://drive.google.com/file/d/<FILE_ID>/view`) มาทำลิงก์ดาวน์โหลดตรง:
   `https://drive.google.com/uc?export=download&confirm=t&id=<FILE_ID>`
4. เปิดคอนโซลหลังบ้าน → **ตั้งค่า → เวอร์ชันแอป** กรอก:
   - เลขเวอร์ชัน (version code) = เลขเดียวกับ `kAppVersionCode` ใหม่
   - ชื่อเวอร์ชัน เช่น `1.0.1`
   - ลิงก์ดาวน์โหลด APK (จากข้อ 3)
   - บังคับอัปเดต (ติ๊กถ้าต้องการให้บังคับ)
   - บันทึก
5. พนักงานเปิดแอป → ถ้า version code ในคอนโซล **มากกว่า** ที่ติดตั้งอยู่ → เด้ง "มีเวอร์ชันใหม่ · อัปเดต" → กดแล้วเปิดลิงก์ดาวน์โหลด → ติดตั้งทับ

> ⚠️ ไฟล์ใหญ่บน Drive จะมีหน้า "virus scan" คั่น — ใช้ลิงก์ `&confirm=t` ช่วยได้ หรือให้เปิดหน้าแชร์แล้วกดดาวน์โหลดเอง

---

## วิธีปล่อยแพตช์หลังบ้าน (Apps Script / Code.gs)

Apps Script ต้องให้เจ้าของ deploy เอง (ไม่มี auto-deploy แบบ public) แต่ระบบช่วยเตือนได้:

1. แก้ `apps_script/Code.gs` → เพิ่ม `BVN_BACKEND_VERSION` (เช่น `'1.0.0'` → `'1.0.1'`)
2. Deploy: **Manage deployments → ✏️ → New version → Deploy** (อย่าสร้าง deployment ใหม่ URL จะเปลี่ยน)
3. (ทางเลือก) อัปโหลด `Code.gs` ล่าสุดขึ้นโฟลเดอร์ Drive เผื่อเจ้าของคนอื่นดึงไปวาง
4. คอนโซลเรียก action `version` เทียบ `backendVersion` กับค่าที่คาดหวัง — ถ้าหลังบ้านเก่ากว่า จะขึ้นแจ้งเตือนให้ deploy

**ขั้นสูง (push อัตโนมัติจริง):** ติดตั้ง `clasp` (Google Apps Script CLI) ล็อกอินครั้งเดียว แล้ว `clasp push` + `clasp deploy` ได้จาก command line — เหมาะถ้าอยาก automate แต่ต้องตั้งค่า auth ครั้งแรก

---

## สรุป action/ค่าที่เกี่ยวข้อง

- Backend action `version` (public) → `{ backendVersion, appVersionCode, appVersionName, appApkUrl, appMandatory, appNotes }`
- Settings keys: `app_version_code`, `app_version_name`, `app_apk_url`, `app_update_mandatory`, `app_update_notes`
- แอป: `lib/update.dart` (`kAppVersionCode`, `checkForUpdate()`, `showUpdateDialog()`)
