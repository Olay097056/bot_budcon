# A2-4 — On-sale day playbook (วัน D ไม่มี deny)

**Type**: task
**Status**: open
**Label**: `wayfinder:task`
**Depends**: 01, 02, 03 (ต้องรู้ว่า transport ไหนรอด + rate ปลอดภัย + ผ่าน 24h แล้ว)

## Question

วัน on-sale จริง (วัน D) traffic ทั่ว TTM พุ่ง — Akamai จะเข้มขึ้น ต้องเตรียมอะไร:

1. **Pre-flight checklist** ก่อนวัน D: cookies สด (login < 2 ชม.), cache อุ่น, runner/watcher พร้อม, probe ล่าสุดผ่าน ≥95%
2. **Silence window**: หยุด probe ทุกอย่าง 30 นาทีก่อนเปิดขาย (ให้ IP score ฟื้น) — ตัดสินใจว่า 30 นาทีพอไหม
3. **Book sequence** วัน D: ใช้ transport ไหนตามลำดับ (curl-first ตาม ticket 01 ถ้าผ่าน)
4. **Fallback ladder**: ถ้า curl เริ่ม 403 กลางวัน D → ทำอย่างไร (cache → wreq → fetch → browser → รอเท่าไหร่)
5. **Recovery**: ถ้าโดน deny ยาวทั้งวัน D — แผน B คืออะไร (ยอมรับไม่ได้ = ต้องหาทาง แต่ Q3=A ห้ามจ่าย)

**Outcome**: playbook 1 หน้า ที่ operator อ่านก่อนวัน D และทำตามได้
