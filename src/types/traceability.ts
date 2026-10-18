export type ProductCategory = 'batch' | 'craft';

export type ArchitectureMode = 'hybrid-web3' | 'gasless-relayer';

export interface GeoLocation {
  lat: number;
  lng: number;
  locationName: string;
  capturedAt: string;
}

export interface BatchAttributes {
  cropType: string;          // เช่น กาแฟอาราบิก้า (Arabica), ชาอัสสัมโบราณ (Assam Tea)
  variety: string;           // สายพันธุ์ เช่น Typica, Catimor, Shan Snow
  elevationMeters: string;   // ความสูงแปลงปลูก เช่น 1,250 เมตรจากระดับน้ำทะเล
  freshWeightKg: number;     // น้ำหนักผลผลิตสด/กะลา (กิโลกรัม)
  plannedBagsCount: number;  // จำนวนถุงที่จะบรรจุขาย
  bagWeightGrams: number;    // ขนาดบรรจุต่อถุง (กรัม) เช่น 250g
}

export interface CraftAttributes {
  weaverName: string;        // ชื่อช่างทอ
  villageName: string;       // หมู่บ้าน/แขวง
  silkType: string;          // ชนิดเส้นไหม เช่น ไหมน้อยสาวมือ, ไหมคำ
  naturalDye: string;        // วัตถุดิบย้อมสีธรรมชาติ เช่น ครามแท้, ครั่ง, เปลือกไม้ประดู่
  ancientPattern: string;    // ชื่อลวดลายโบราณ เช่น ลายนาคโบราณ, ลายสีโห
  weavingDays: number;       // ระยะเวลาที่ใช้ทอ (วัน)
  nfcUid?: string;           // UID ชิป NFC ที่ผูกกับผืนผ้าไหม
}

export interface CheckpointMetadata {
  stepNumber: number;
  stageType: 'origin' | 'processing' | 'roasting_dyeing' | 'qc' | 'export';
  title: string;             // เช่น "เก็บเกี่ยวเชอร์รี่กาแฟสุกคัดมือ", "Washed Process เสร็จสิ้น", "คั่วระดับ Medium Roast"
  description: string;
  actorName: string;
  actorRole: string;
  actorAddress: string;
  timestamp: string;
  txHash: string;
  ipfsHash: string;
  imageUrl: string;
  geo: GeoLocation;
  extraSpecs?: Record<string, string>;
}

export interface SubUnitPinCode {
  unitCode: string;          // เช่น "LT-1-BAG-001"
  pinCode: string;           // รหัส PIN 6 หลักสำหรับขูดยืนยันของแท้
  qrVerifyUrl: string;       // ลิงก์ตรวจสอบ
  isClaimed: boolean;
  claimedAt?: string;
  claimedByNote?: string;
}

export interface QuotaCalculationResult {
  tokenId: number;
  rawWeightKg: number;
  yieldRatioPercent: number; // เช่น 80% หลังสีและคั่ว
  maxNetWeightKg: number;
  bagWeightGrams: number;
  maxAllowedBags: number;    // โควตาจำนวนถุงสูงสุดที่อนุญาตให้สร้าง QR
  requestedBags: number;
  isWithinQuota: boolean;
  generatedUnits: SubUnitPinCode[];
}

export interface CertificationRecord {
  isCertified: boolean;
  certIpfsHash: string;
  certPdfUrl: string;
  certStandard: string;      // เช่น "100% Verified Lao Organic & GI (Paksong)"
  certifierOrganization: string; // เช่น "กรมกสิกรรม (Department of Agriculture)"
  certifierAddress: string;
  certifiedAt: string;
  txHash: string;
  inspectorNote: string;
}

export interface TraceableProduct {
  tokenId: number;
  category: ProductCategory;
  productName: string;
  producerName: string;
  producerAddress: string;
  originIpfsHash: string;
  createdAt: string;
  originTxHash: string;
  heroImageUrl: string;
  geo: GeoLocation;
  batchData?: BatchAttributes;
  craftData?: CraftAttributes;
  checkpoints: CheckpointMetadata[];
  certification: CertificationRecord;
  quota?: QuotaCalculationResult;
}

export interface OfflineDraftItem {
  id: string;
  createdAt: string;
  category: ProductCategory;
  productName: string;
  producerName: string;
  geo: GeoLocation;
  imagePreviewDataUrl: string;
  batchData?: BatchAttributes;
  craftData?: CraftAttributes;
}
