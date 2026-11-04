from pathlib import Path
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

OUT = Path('output/pdf/BVN_Invoice_Phanomporn_Template.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Thai', r'C:\Windows\Fonts\tahoma.ttf'))
c = Canvas(str(OUT), pagesize=A4); w,h=A4
navy,blue,muted = HexColor('#102A43'),HexColor('#146EF5'),HexColor('#627D98')
c.setFillColor(navy); c.rect(0,h-105,w,105,fill=1,stroke=0)
c.setFillColor(white); c.setFont('Thai',24); c.drawString(42,h-60,'BVN PACKAGE')
c.setFont('Thai',10); c.drawString(42,h-82,'ใบแจ้งหนี้ / INVOICE')
c.setFillColor(blue); c.roundRect(w-190,h-165,148,36,8,fill=1,stroke=0); c.setFillColor(white); c.setFont('Thai',12); c.drawCentredString(w-116,h-151,'INV-YYYYMM-001')
c.setFillColor(navy); c.setFont('Thai',13); c.drawString(42,h-150,'เรียกเก็บเงินจาก / BILL TO')
c.setFont('Thai',12); c.drawString(42,h-174,'บริษัท พนมพร พาณิชย์ จำกัด')
c.setFont('Thai',11); c.drawString(42,h-194,'Phanomporn Phanich Co.,Ltd')
c.setFillColor(muted); c.setFont('Thai',10); c.drawString(42,h-214,'479/162 ซอย สุทธิพร แขวงดินแดง เขตดินแดง กทม. 10400')
c.drawString(42,h-232,'Tel. 0967979923   Tax ID 0105569911266')
c.setFillColor(navy); c.setFont('Thai',10); c.drawRightString(w-42,h-178,'วันที่ออกเอกสาร: __________'); c.drawRightString(w-42,h-198,'ครบกำหนดชำระ: __________')
y=h-280; c.setFillColor(navy); c.rect(42,y,w-84,28,fill=1,stroke=0); c.setFillColor(white); c.setFont('Thai',10)
for x,t in [(52,'รายการ'),(350,'จำนวน'),(420,'ราคา/หน่วย'),(510,'รวม')]: c.drawString(x,y+9,t)
c.setFillColor(HexColor('#F5F8FB')); c.rect(42,y-120,w-84,120,fill=1,stroke=0); c.setFillColor(muted); c.setFont('Thai',11); c.drawString(52,y-30,'ระบุบริการ / รายการเรียกเก็บ'); c.drawRightString(w-52,y-30,'฿0.00')
c.setFillColor(navy); c.setFont('Thai',11); c.drawRightString(w-52,y-150,'รวมก่อน VAT      ฿0.00'); c.drawRightString(w-52,y-172,'VAT 7%           ฿0.00')
c.setFillColor(blue); c.roundRect(w-250,y-220,208,36,8,fill=1,stroke=0); c.setFillColor(white); c.setFont('Thai',13); c.drawRightString(w-54,y-198,'ยอดสุทธิ ฿0.00')
c.setFillColor(muted); c.setFont('Thai',9); c.drawString(42,72,'หมายเหตุ: กรุณาระบุเลขที่ใบแจ้งหนี้เมื่อชำระเงิน'); c.drawString(42,54,'BVN Package | เอกสารนี้ออกจากระบบหลังบ้าน')
c.save(); print(OUT)
