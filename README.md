# LaoTrace Frontend (`laotrace-app`)

ระบบตรวจสอบย้อนกลับและป้องกันสินค้าปลอมแปลงด้วย Web3 บนเครือข่าย **LAB Chain (Chain ID: 5222)** สำหรับสินค้าเกษตรมูลค่าสูง (เช่น กาแฟปากซอง, ชาอัสสัมพงสาลี) และสินค้าหัตถกรรมผ้าไหมทอมือย้อมสีธรรมชาติ

---

## โครงสร้าง 3 หน้าจอหลัก (Views)

1. **หน้าจอที่ 1: Producer & Processor Portal (`src/components/ProducerProcessorPortal.tsx`)**
   - **Dynamic Onboarding Form:** สลับโหมดอัตโนมัติระหว่าง **โหมดสินค้าเกษตร (Batch Mode)** และ **โหมดหัตถกรรมผ้าไหม (Unique Item Mode)**
   - **Auto Geo-Tagging & Offline Sync:** ดึงพิกัดละติจูด/ลองจิจูดผ่าน `navigator.geolocation` พร้อมเวลาถ่ายภาพ รองรับการบันทึกแบบ Offline ลงเครื่องขณะอยู่บนดอยแล้วกด Sync ขึ้น IPFS & LAB Chain เมื่อมีสัญญาณอินเทอร์เน็ต
   - **Add Checkpoint Form:** สำหรับโรงสีเปียก โรงคั่วกาแฟ และสหกรณ์ทอผ้า เพื่ออัปเดตสถานะกลางน้ำ (`contract.addCheckpoint(tokenId, ipfsHash)`)
   - **Mass Balance Calculator & QR/PIN Generator:** คำนวณโควตาน้ำหนักวัตถุดิบต้นน้ำเทียบกับจำนวนถุงปลายน้ำ และสร้างป้าย QR Code พร้อมรหัส PIN ขูดยืนยันรายถุงสั่งพิมพ์ได้ทันที

2. **หน้าจอที่ 2: Certifier Dashboard (`src/components/CertifierDashboard.tsx`)**
   - แสดงรายการสินค้าที่รอการตรวจสอบมาตรฐาน Organic / GI
   - อัปโหลดไฟล์ PDF ใบรับรองขึ้น IPFS และกดปุ่ม **Verify & Certify On-Chain** เพื่อเรียก `contract.certifyProduct(tokenId, certIpfsHash)` (`isCertified = true`)

3. **หน้าจอที่ 3: Consumer Verification Page (`src/components/ConsumerVerificationPage.tsx`) ⭐**
   - **Read-Only Blockchain Connection (`ethers.JsonRpcProvider`):** ดึงข้อมูลจาก `contract.getTimeline(tokenId)` บน LAB Chain (`https://rpc.labchain.la`) และ IPFS Gateway ทันทีโดยไม่ต้องติดตั้งหรือเชื่อมต่อ MetaMask
   - **Interactive Provenance Timeline & Origin Map:** แสดงเส้นทางสินค้าทุกขั้นตอน แผนที่พิกัดสวน และปุ่ม **View on LAB Chain Block Explorer**
   - **100% Verified Lao Organic / GI Badge & Ownership Claim:** เปิดดูไฟล์ใบเซอร์ตัวจริงจาก IPFS และกรอกรหัส PIN ขูดรายถุง / แตะชิป NFC เพื่อยืนยันความเป็นเจ้าของครั้งแรก

---

## การเชื่อมต่อกับเพื่อนฝั่ง Backend (3 API Endpoints)

สามารถตั้งค่า `Backend REST API URL` และ `Contract Address` ได้โดยตรงจากปุ่ม **ฟันเฟือง (Settings)** มุมขวาบนของหน้าเว็บ:

| Endpoint | หน้าที่ |
| :--- | :--- |
| `POST /api/ipfs/upload-metadata` | รับไฟล์รูปภาพ/PDF พร้อม JSON Metadata อัปโหลดขึ้น Pinata (IPFS) แล้วส่ง `{ "ipfsHash": "ipfs://..." }` กลับมา |
| `POST /api/quota/generate-codes` | รับ `tokenId` และน้ำหนักผลผลิต คำนวณโควตา Mass Balance และสร้างรหัส QR ย่อยพร้อมรหัส PIN |
| `POST /api/verify-pin` | ตรวจสอบรหัส PIN ที่ผู้บริโภคขูดจากถุงกาแฟว่าเป็นของแท้และยังไม่ถูกใช้งานซ้ำ (ไม่ต้องเสียค่า Gas) |

---

## คำสั่งรันโปรเจกต์

```bash
# รันเซิร์ฟเวอร์พัฒนา (Vite Dev Server)
npm run dev

# สร้าง TypeScript Interfaces จาก ABI ด้วย TypeChain
npm run typechain

# ตรวจสอบ Type และ Build สำหรับใช้งานจริง
npm run build
```
