import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import {
  Camera,
  CheckCircle2,
  CloudOff,
  Coffee,
  Cpu,
  ExternalLink,
  Factory,
  MapPin,
  PackagePlus,
  Printer,
  QrCode,
  RefreshCw,
  Scale,
  Send,
  Sparkles,
  Upload,
  Wifi,
} from 'lucide-react';
import {
  ArchitectureMode,
  CheckpointMetadata,
  OfflineDraftItem,
  ProductCategory,
  QuotaCalculationResult,
  TraceableProduct,
} from '../types/traceability';
import {
  callAddCheckpointOnChain,
  callRegisterProductOnChain,
  generateMassBalanceQuotaCodes,
  uploadMetadataToIpfs,
} from '../services/apiAndWeb3Service';
import { getExplorerTxUrl } from '../config/labChain';

interface ProducerProcessorPortalProps {
  products: TraceableProduct[];
  offlineDrafts: OfflineDraftItem[];
  architectureMode: ArchitectureMode;
  contractAddress: string;
  backendApiUrl: string;
  onProductRegistered: (newProduct: TraceableProduct) => void;
  onCheckpointAdded: (tokenId: number, checkpoint: CheckpointMetadata) => void;
  onQuotaUpdated: (tokenId: number, quota: QuotaCalculationResult) => void;
  onSaveOfflineDraft: (draft: OfflineDraftItem) => void;
  onRemoveOfflineDraft: (draftId: string) => void;
  onOpenConsumerView: (tokenId: number) => void;
}

const PRESET_LOCATIONS = [
  {
    label: 'สวนกาแฟปากซอง (15.1764, 106.2338)',
    lat: 15.1764,
    lng: 106.2338,
    locationName: 'เมืองปากซอง แขวงจำปาสัก (ที่ราบสูงบอละเวน 1,280m)',
  },
  {
    label: 'หมู่บ้านทอผ้าไหมโพนงาม (19.8856, 102.1347)',
    lat: 19.8856,
    lng: 102.1347,
    locationName: 'บ้านโพนงาม แขวงหลวงพระบาง',
  },
  {
    label: 'ป่าชาอัสสัมโบราณ 400 ปี (21.6833, 102.1058)',
    lat: 21.6833,
    lng: 102.1058,
    locationName: 'บ้านกอแหม่ง แขวงพงสาลี (1,620m)',
  },
];

const CHECKPOINT_PRESETS = [
  {
    label: 'สีเปียก & ตากแคร่ยกสูง (Washed Process เสร็จสิ้น)',
    stageType: 'processing' as const,
    title: 'Washed Process & ตากแคร่ยกสูงเสร็จสิ้น (ความชื้น 11.2%)',
    description: 'ผ่านขั้นตอนสีเปียกด้วยน้ำแร่ธรรมชาติ หมักควบคุมอุณหภูมิ 36 ชม. และตากบนแคร่ยกสูง 14 วัน',
    specKey: 'วิธีแปรรูป',
    specVal: 'Fully Washed Process (Moisture 11.2%)',
  },
  {
    label: 'คั่วกาแฟระดับ Medium Roast',
    stageType: 'roasting_dyeing' as const,
    title: 'คั่วระดับ Medium Roast & ทดสอบ Cupping Score 86.5',
    description: 'คั่วด้วยโปรไฟล์ Artisan Medium Roast หอมกลิ่นช็อกโกแลตและดอกไม้ป่า บรรจุถุงวาล์วพร้อมรหัส PIN',
    specKey: 'ระดับการคั่ว',
    specVal: 'Medium Roast (Cupping 86.5)',
  },
  {
    label: 'ทอมือและย้อมครามธรรมชาติเสร็จสิ้น',
    stageType: 'roasting_dyeing' as const,
    title: 'ทอมือและย้อมครามธรรมชาติเสร็จสิ้น (Natural Dyeing)',
    description: 'ย้อมหม้อครามธรรมชาติหมักพื้นบ้าน 12 รอบ สีติดทนนาน ปลอดสารเคมีสังเคราะห์ 100%',
    specKey: 'สีย้อมธรรมชาติ',
    specVal: 'ครามป่าหมักธรรมชาติ 100%',
  },
  {
    label: 'ตรวจสอบคุณภาพ & ส่งออก (Export Cleared)',
    stageType: 'export' as const,
    title: 'ผ่านการตรวจสอบคุณภาพ (QC) & เตรียมส่งออก',
    description: 'ตรวจสอบคุณภาพมาตรฐานส่งออกและผูกป้าย QR Code / ชิป NFC ประจำสินค้าเสร็จสมบูรณ์',
    specKey: 'สถานะการส่งออก',
    specVal: 'QC Passed & Ready for Export',
  },
];

export const ProducerProcessorPortal: React.FC<ProducerProcessorPortalProps> = ({
  products,
  offlineDrafts,
  architectureMode,
  contractAddress,
  backendApiUrl,
  onProductRegistered,
  onCheckpointAdded,
  onQuotaUpdated,
  onSaveOfflineDraft,
  onRemoveOfflineDraft,
  onOpenConsumerView,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'producer' | 'processor' | 'mass-balance'>('producer');

  // Producer Onboarding State
  const [category, setCategory] = useState<ProductCategory>('batch');
  const [productName, setProductName] = useState('Paksong Arabica (กาแฟอาราบิก้า ดอยปากซอง)');
  const [producerName, setProducerName] = useState('กลุ่มผู้ปลูกกาแฟอินทรีย์บ้านหลัก 40');

  // Batch Mode Fields (Category.AGRICULTURE = 0)
  // ตามกฎ LaoTraceWeb3.sol: require(_requestedUnits <= _rawWeightKg * 2)
  const [cropType, setCropType] = useState('กาแฟอาราบิก้า (Arabica Coffee)');
  const [variety, setVariety] = useState('Typica & Bourbon');
  const [elevationMeters, setElevationMeters] = useState('1,280 เมตรจากระดับน้ำทะเล');
  const [freshWeightKg, setFreshWeightKg] = useState<number>(500);
  const [plannedBagsCount, setPlannedBagsCount] = useState<number>(800);
  const [bagWeightGrams, setBagWeightGrams] = useState<number>(250);

  // Craft Mode Fields (Category.HANDICRAFT = 1, rawWeightKg = 0, maxUnits = 1)
  const [weaverName, setWeaverName] = useState('แม่ครูบัวไข วงศ์ละคร');
  const [villageName, setVillageName] = useState('บ้านโพนงาม แขวงหลวงพระบาง');
  const [silkType, setSilkType] = useState('ไหมน้อยสาวมือพันธุ์พื้นเมืองแท้ 100%');
  const [naturalDye, setNaturalDye] = useState('ครามธรรมชาติ & ครั่งป่า');
  const [ancientPattern, setAncientPattern] = useState('ลายนาคโขงโบราณ');
  const [weavingDays, setWeavingDays] = useState<number>(21);
  const [nfcUid, setNfcUid] = useState('NFC-UID-04:B8:3C:91:7A:22:80');

  // Geo & Media State
  const [lat, setLat] = useState<number>(15.1764);
  const [lng, setLng] = useState<number>(106.2338);
  const [locationName, setLocationName] = useState('เมืองปากซอง แขวงจำปาสัก (ที่ราบสูงบอละเวน 1,280m)');
  const [capturedAt, setCapturedAt] = useState<string>(() => new Date().toISOString().replace('T', ' ').slice(0, 19));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80'
  );
  const [rootIpfsHashInput, setRootIpfsHashInput] = useState<string>('');
  const [isUploadingRootIpfs, setIsUploadingRootIpfs] = useState<boolean>(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedProductResult, setMintedProductResult] = useState<TraceableProduct | null>(null);

  // Processor Checkpoint State
  const [selectedTokenId, setSelectedTokenId] = useState<number>(products[0]?.tokenId || 1);
  const [checkpointStage, setCheckpointStage] = useState<'processing' | 'roasting_dyeing' | 'qc' | 'export'>('processing');
  const [checkpointTitle, setCheckpointTitle] = useState('Washed Process & ตากแคร่ยกสูงเสร็จสิ้น');
  const [checkpointDesc, setCheckpointDesc] = useState(
    'สีเปียกด้วยน้ำแร่ธรรมชาติจากน้ำตกปากซอง หมักควบคุมอุณหภูมิ 36 ชม. และตากแคร่ยกสูงจนความชื้นอยู่ที่ 11.2%'
  );
  const [processorName, setProcessorName] = useState('สหกรณ์แปรรูปกาแฟปากซอง (Bolaven Wet Mill)');
  const [checkpointGps, setCheckpointGps] = useState('15.1821, 106.2412');
  const [roastOrProcessSpec, setRoastOrProcessSpec] = useState('Medium Roast / Moisture 11.2%');
  const [checkpointFile, setCheckpointFile] = useState<File | null>(null);
  const [checkpointImgPreview, setCheckpointImgPreview] = useState<string>(
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80'
  );
  const [evidenceIpfsHashInput, setEvidenceIpfsHashInput] = useState<string>('');
  const [isUploadingCheckpointIpfs, setIsUploadingCheckpointIpfs] = useState<boolean>(false);
  const [isSubmittingCheckpoint, setIsSubmittingCheckpoint] = useState(false);

  // Mass Balance Quota Calculator State
  const [quotaTokenId, setQuotaTokenId] = useState<number>(1);
  const [rawInputKg, setRawInputKg] = useState<number>(500);
  const [yieldPercent, setYieldPercent] = useState<number>(80);
  const [unitBagGrams, setUnitBagGrams] = useState<number>(250);
  const [requestedBagUnits, setRequestedBagUnits] = useState<number>(800);
  const [isGeneratingQuota, setIsGeneratingQuota] = useState(false);

  const qrDialogRef = useRef<HTMLDialogElement | null>(null);
  const [qrModalProduct, setQrModalProduct] = useState<TraceableProduct | null>(null);

  const openQrLabelDialog = (prod: TraceableProduct) => {
    setQrModalProduct(prod);
    if (qrDialogRef.current && typeof qrDialogRef.current.showModal === 'function') {
      qrDialogRef.current.showModal();
    }
  };

  const handleSelectCategory = (nextCat: ProductCategory) => {
    setCategory(nextCat);
    if (nextCat === 'batch') {
      setProductName('Paksong Arabica (กาแฟอาราบิก้า ดอยปากซอง)');
      setProducerName('กลุ่มผู้ปลูกกาแฟอินทรีย์บ้านหลัก 40');
      setLat(15.1764);
      setLng(106.2338);
      setLocationName('เมืองปากซอง แขวงจำปาสัก (ที่ราบสูงบอละเวน 1,280m)');
      setImagePreview('https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80');
    } else {
      setProductName('Savannakhet / Luang Prabang Handwoven Silk');
      setProducerName('แม่ครูบัวไข วงศ์ละคร (กลุ่มทอผ้าบ้านโพนงาม)');
      setLat(19.8856);
      setLng(102.1347);
      setLocationName('บ้านโพนงาม แขวงหลวงพระบาง');
      setImagePreview('https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80');
    }
  };

  // ดึงพิกัด GPS จริงจากมือถือชาวสวนด้วย navigator.geolocation.getCurrentPosition() สำหรับ registerProduct()
  const handleCaptureGps = () => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setCapturedAt(nowStr);

    if (!navigator.geolocation) {
      toast.error('เบราว์เซอร์ไม่รองรับ Geolocation API ใช้พิกัดแปลงปลูกเริ่มต้นแทน');
      return;
    }

    const loadingId = toast.loading('กำลังดึงค่าพิกัด GPS ปัจจุบันจากมือถือ (navigator.geolocation)...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss(loadingId);
        const newLat = Number(pos.coords.latitude.toFixed(5));
        const newLng = Number(pos.coords.longitude.toFixed(5));
        setLat(newLat);
        setLng(newLng);
        setLocationName(`พิกัดถ่ายภาพจริง (${newLat}, ${newLng})`);
        toast.success(`ดึงพิกัด GPS จากอุปกรณ์สำเร็จ: ${newLat}, ${newLng}`);
      },
      () => {
        toast.dismiss(loadingId);
        toast.success(`ฝังพิกัดแปลงปลูกมาตรฐาน (${lat}, ${lng}) และเวลา ${nowStr} เรียบร้อย`);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // ดึงพิกัด GPS จริงจากมือถือโรงแปรรูปด้วย navigator.geolocation.getCurrentPosition() สำหรับ addCheckpoint()
  const handleCaptureCheckpointGps = () => {
    if (!navigator.geolocation) {
      toast.error('เบราว์เซอร์ไม่รองรับ Geolocation API');
      return;
    }

    const loadingId = toast.loading('กำลังดึงพิกัด GPS ปัจจุบันสำหรับ addCheckpoint()...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss(loadingId);
        const newLat = Number(pos.coords.latitude.toFixed(5));
        const newLng = Number(pos.coords.longitude.toFixed(5));
        const formatted = `${newLat}, ${newLng}`;
        setCheckpointGps(formatted);
        toast.success(`ดึงพิกัด _locationGPS สำเร็จ: ${formatted}`);
      },
      () => {
        toast.dismiss(loadingId);
        toast.error('ไม่สามารถเข้าถึง GPS มือถือได้ กรุณาอนุญาต Location หรือเลือกพิกัดจำลอง');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // อัปโหลดรูปต้นน้ำขึ้น Pinata.cloud / IPFS เพื่อเอา CID มาใส่ช่อง _rootIpfsHash ทันที
  const handlePreUploadRootToPinata = async () => {
    setIsUploadingRootIpfs(true);
    const toastId = toast.loading('กำลังอัปโหลดรูปภาพและ JSON ขึ้น Pinata.cloud (IPFS)...');
    try {
      const res = await uploadMetadataToIpfs(
        selectedFile,
        {
          name: productName,
          producerName,
          initialGPS: `${lat}, ${lng}`,
          category: category === 'batch' ? 'AGRICULTURE' : 'HANDICRAFT',
        },
        backendApiUrl
      );
      setRootIpfsHashInput(res.ipfsHash);
      toast.success(
        `ได้รับรหัส CID จาก ${
          res.source === 'pinata-direct'
            ? 'Pinata.cloud API จริง'
            : res.source === 'backend-api'
            ? 'Backend IPFS API'
            : 'ระบบจำลอง CID'
        }: ${res.ipfsHash}`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'อัปโหลด IPFS ไม่สำเร็จ', { id: toastId });
    } finally {
      setIsUploadingRootIpfs(false);
    }
  };

  // อัปโหลดรูปหลักฐานแปรรูปขึ้น Pinata.cloud / IPFS เพื่อเอา CID มาใส่ช่อง _evidenceIpfsHash ทันที
  const handlePreUploadCheckpointToPinata = async () => {
    setIsUploadingCheckpointIpfs(true);
    const toastId = toast.loading('กำลังอัปโหลดรูปหลักฐานการแปรรูปขึ้น Pinata.cloud (IPFS)...');
    try {
      const res = await uploadMetadataToIpfs(
        checkpointFile,
        {
          productId: selectedTokenId,
          stageName: checkpointTitle,
          locationGPS: checkpointGps,
          processorName,
        },
        backendApiUrl
      );
      setEvidenceIpfsHashInput(res.ipfsHash);
      toast.success(
        `ได้รับรหัส CID (_evidenceIpfsHash): ${res.ipfsHash}`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'อัปโหลด IPFS ไม่สำเร็จ', { id: toastId });
    } finally {
      setIsUploadingCheckpointIpfs(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isCheckpoint = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (isCheckpoint) {
        setCheckpointFile(file);
        setCheckpointImgPreview(dataUrl);
        toast.success('แนบรูปหลักฐานขั้นตอนการแปรรูปเรียบร้อย (กดปุ่มอัปโหลดขึ้น Pinata เพื่อรับ CID ได้ทันที)');
      } else {
        setSelectedFile(file);
        setImagePreview(dataUrl);
        handleCaptureGps();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveOffline = () => {
    const draft: OfflineDraftItem = {
      id: `DRAFT-${Date.now()}`,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      category,
      productName,
      producerName,
      geo: { lat, lng, locationName, capturedAt },
      imagePreviewDataUrl: imagePreview,
      batchData:
        category === 'batch'
          ? { cropType, variety, elevationMeters, freshWeightKg, plannedBagsCount, bagWeightGrams }
          : undefined,
      craftData:
        category === 'craft'
          ? { weaverName, villageName, silkType, naturalDye, ancientPattern, weavingDays, nfcUid }
          : undefined,
    };
    onSaveOfflineDraft(draft);
    toast.success('บันทึกข้อมูลแบบ Offline ลงในเครื่องสำเร็จ! สามารถกด Sync ขึ้น Blockchain ได้เมื่อมีอินเทอร์เน็ต');
  };

  // เรียก LaoTraceWeb3.registerProduct(_category, _name, _rootIpfsHash, _initialGPS, _rawWeightKg, _requestedUnits)
  const handleRegisterProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ตรวจสอบกฎ Mass Balance บนเชนของ LaoTraceWeb3.sol ก่อนส่ง
    if (category === 'batch' && plannedBagsCount > freshWeightKg * 2) {
      toast.error(
        `กฎ Mass Balance บน Smart Contract: กาแฟสด ${freshWeightKg} กก. บรรจุขายจริงได้ไม่เกิน ${
          freshWeightKg * 2
        } ถุง (rawWeightKg * 2)!`
      );
      return;
    }

    setIsMinting(true);
    const nextTokenId = products.reduce((max, p) => Math.max(max, p.tokenId), 0) + 1;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const initialGpsString = `${lat}, ${lng}`;

    const metadataPayload = {
      name: productName,
      description:
        category === 'batch'
          ? `สินค้าเกษตรต้นน้ำ (Category.AGRICULTURE): ${cropType} สายพันธุ์ ${variety} ความสูง ${elevationMeters} น้ำหนักสด ${freshWeightKg} กก. (maxUnits = ${plannedBagsCount})`
          : `สินค้าหัตถกรรมชิ้นเดียวในโลก (Category.HANDICRAFT, maxUnits = 1): ทอโดย ${weaverName} หมู่บ้าน ${villageName} ย้อมสี ${naturalDye} ลาย ${ancientPattern}`,
      category: category === 'batch' ? 'AGRICULTURE' : 'HANDICRAFT',
      producerName,
      initialGPS: initialGpsString,
      rawWeightKg: category === 'batch' ? freshWeightKg : 0,
      maxUnits: category === 'batch' ? plannedBagsCount : 1,
      geo: { lat, lng, locationName, capturedAt: nowStr },
    };

    const toastId = toast.loading('1/2 กำลังอัปโหลดรูปภาพและ Metadata JSON ขึ้น IPFS (Pinata)...');
    try {
      const ipfsRes = rootIpfsHashInput.trim()
        ? { ipfsHash: rootIpfsHashInput.trim() }
        : await uploadMetadataToIpfs(selectedFile, metadataPayload, backendApiUrl);
      setRootIpfsHashInput(ipfsRes.ipfsHash);

      toast.loading(
        architectureMode === 'hybrid-web3'
          ? `2/2 กำลังเรียก LaoTraceWeb3.registerProduct(${category === 'batch' ? 0 : 1}, "${productName}", ...) บน LAB Chain...`
          : `2/2 กำลังส่ง Transaction ผ่านระบบ Gasless Relayer ไปยัง LAB Chain...`,
        { id: toastId }
      );

      const txRes = await callRegisterProductOnChain({
        category,
        name: productName,
        ipfsHash: ipfsRes.ipfsHash,
        initialGPS: initialGpsString,
        rawWeightKg: category === 'batch' ? freshWeightKg : 0,
        requestedUnits: category === 'batch' ? plannedBagsCount : 1,
        mode: architectureMode,
        contractAddress,
        backendApiUrl,
      });

      const finalId = txRes.onChainProductId || nextTokenId;

      const quotaRes =
        category === 'batch'
          ? await generateMassBalanceQuotaCodes({
              tokenId: finalId,
              rawWeightKg: freshWeightKg,
              bagWeightGrams,
              requestedBags: plannedBagsCount,
              backendApiUrl,
            })
          : undefined;

      const newProduct: TraceableProduct = {
        tokenId: finalId,
        category,
        productName,
        producerName,
        producerAddress: txRes.signerAddress,
        originIpfsHash: ipfsRes.ipfsHash,
        createdAt: nowStr,
        originTxHash: txRes.txHash,
        heroImageUrl: imagePreview,
        geo: { lat, lng, locationName, capturedAt: nowStr },
        batchData:
          category === 'batch'
            ? { cropType, variety, elevationMeters, freshWeightKg, plannedBagsCount, bagWeightGrams }
            : undefined,
        craftData:
          category === 'craft'
            ? { weaverName, villageName, silkType, naturalDye, ancientPattern, weavingDays, nfcUid }
            : undefined,
        checkpoints: [
          {
            stepNumber: 1,
            stageType: 'origin',
            title:
              category === 'batch'
                ? `Harvested at Origin Farm (${cropType} • ${freshWeightKg} กก.)`
                : `Handwoven by Artisan (${ancientPattern} • maxUnits = 1)`,
            description: metadataPayload.description,
            actorName: producerName,
            actorRole: 'authorizedProducers',
            actorAddress: txRes.signerAddress,
            timestamp: nowStr,
            txHash: txRes.txHash,
            ipfsHash: ipfsRes.ipfsHash,
            imageUrl: imagePreview,
            geo: { lat, lng, locationName, capturedAt: nowStr },
            extraSpecs:
              category === 'batch'
                ? {
                    'Category': 'AGRICULTURE (0)',
                    'rawWeightKg': `${freshWeightKg} กก.`,
                    'maxUnits': `${plannedBagsCount} ถุง (<= ${freshWeightKg * 2})`,
                  }
                : {
                    'Category': 'HANDICRAFT (1)',
                    'maxUnits': '1 ชิ้น (Unique Item)',
                    'NFC UID': nfcUid,
                  },
          },
        ],
        certification: {
          isCertified: false,
          certIpfsHash: '',
          certPdfUrl: '',
          certStandard: 'รอการตรวจสอบมาตรฐาน Lao Organic / GI',
          certifierOrganization: 'กรมกสิกรรม (DOA) / สมาคมหัตถกรรมแห่งชาติ',
          certifierAddress: '',
          certifiedAt: '',
          txHash: '',
          inspectorNote: 'เพิ่งลงทะเบียนต้นน้ำ รอผู้ตรวจมาตรฐานกดประทับตรา certifyProduct() บนเชน',
        },
        quota: quotaRes,
      };

      onProductRegistered(newProduct);
      setMintedProductResult(newProduct);
      setSelectedTokenId(newProduct.tokenId);
      setQuotaTokenId(newProduct.tokenId);

      toast.success(
        `Mint สำเร็จ! สร้าง Product ID #${finalId} บน LaoTraceWeb3 และสร้างป้าย QR Code เรียบร้อย`,
        { id: toastId, duration: 5000 }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
      toast.error(msg, { id: toastId });
    } finally {
      setIsMinting(false);
    }
  };

  const handleSyncOfflineDraft = async (draft: OfflineDraftItem) => {
    const toastId = toast.loading(`กำลัง Sync "${draft.productName}" ขึ้น IPFS และ LAB Chain...`);
    try {
      const ipfsRes = await uploadMetadataToIpfs(null, { ...draft }, backendApiUrl);
      const rawW = draft.category === 'batch' ? draft.batchData?.freshWeightKg || 500 : 0;
      const reqU = draft.category === 'batch' ? draft.batchData?.plannedBagsCount || 800 : 1;

      const txRes = await callRegisterProductOnChain({
        category: draft.category,
        name: draft.productName,
        ipfsHash: ipfsRes.ipfsHash,
        initialGPS: `${draft.geo.lat}, ${draft.geo.lng}`,
        rawWeightKg: rawW,
        requestedUnits: reqU,
        mode: architectureMode,
        contractAddress,
        backendApiUrl,
      });

      const nextTokenId = products.reduce((max, p) => Math.max(max, p.tokenId), 0) + 1;
      const syncedProduct: TraceableProduct = {
        tokenId: nextTokenId,
        category: draft.category,
        productName: draft.productName,
        producerName: draft.producerName,
        producerAddress: txRes.signerAddress,
        originIpfsHash: ipfsRes.ipfsHash,
        createdAt: draft.createdAt,
        originTxHash: txRes.txHash,
        heroImageUrl: draft.imagePreviewDataUrl,
        geo: draft.geo,
        batchData: draft.batchData,
        craftData: draft.craftData,
        checkpoints: [
          {
            stepNumber: 1,
            stageType: 'origin',
            title:
              draft.category === 'batch'
                ? 'Harvested at Origin Farm (Offline Synced)'
                : 'Handwoven by Artisan (Offline Synced)',
            description: `ถ่ายภาพและเก็บพิกัด GPS (${draft.geo.lat}, ${draft.geo.lng}) เมื่อ ${draft.geo.capturedAt}`,
            actorName: draft.producerName,
            actorRole: 'authorizedProducers',
            actorAddress: txRes.signerAddress,
            timestamp: draft.createdAt,
            txHash: txRes.txHash,
            ipfsHash: ipfsRes.ipfsHash,
            imageUrl: draft.imagePreviewDataUrl,
            geo: draft.geo,
          },
        ],
        certification: {
          isCertified: false,
          certIpfsHash: '',
          certPdfUrl: '',
          certStandard: 'รอการตรวจสอบมาตรฐาน Lao Organic / GI',
          certifierOrganization: 'กรมกสิกรรม (DOA)',
          certifierAddress: '',
          certifiedAt: '',
          txHash: '',
          inspectorNote: 'รอผู้ตรวจมาตรฐานตรวจสอบ',
        },
      };

      onProductRegistered(syncedProduct);
      onRemoveOfflineDraft(draft.id);
      setMintedProductResult(syncedProduct);
      toast.success(`Sync ข้อมูล Offline เป็น Product #${nextTokenId} สำเร็จ!`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync ไม่สำเร็จ', { id: toastId });
    }
  };

  // ฟังก์ชันที่ 2 ของ LaoTraceWeb3.sol: addCheckpoint(_productId, _stageName, _locationGPS, _evidenceIpfsHash)
  const handleAddCheckpointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProduct = products.find((p) => p.tokenId === selectedTokenId);
    if (!targetProduct) {
      toast.error('ไม่พบรหัสสินค้าที่เลือก');
      return;
    }

    setIsSubmittingCheckpoint(true);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const nextStepNum = targetProduct.checkpoints.length + 1;

    const toastId = toast.loading('1/2 กำลังอัปโหลดหลักฐานขั้นตอนการผลิต (evidenceIpfsHash) ขึ้น Pinata IPFS...');
    try {
      const ipfsRes = evidenceIpfsHashInput.trim()
        ? { ipfsHash: evidenceIpfsHashInput.trim() }
        : await uploadMetadataToIpfs(
            checkpointFile,
            {
              productId: selectedTokenId,
              stepNumber: nextStepNum,
              stageName: checkpointTitle,
              locationGPS: checkpointGps,
              description: checkpointDesc,
              processorName,
              roastOrProcessSpec,
              timestamp: nowStr,
            },
            backendApiUrl
          );
      setEvidenceIpfsHashInput(ipfsRes.ipfsHash);

      toast.loading(
        `2/2 กำลังเรียก LaoTraceWeb3.addCheckpoint(${selectedTokenId}, "${checkpointTitle}", "${checkpointGps}", "${ipfsRes.ipfsHash}") บน LAB Chain...`,
        { id: toastId }
      );

      const txRes = await callAddCheckpointOnChain({
        tokenId: selectedTokenId,
        stageName: checkpointTitle,
        locationGPS: checkpointGps,
        ipfsHash: ipfsRes.ipfsHash,
        mode: architectureMode,
        contractAddress,
        backendApiUrl,
      });

      const [parsedLat, parsedLng] = checkpointGps
        .split(',')
        .map((s) => Number(s.trim()));

      const newCheckpoint: CheckpointMetadata = {
        stepNumber: nextStepNum,
        stageType: checkpointStage,
        title: checkpointTitle,
        description: checkpointDesc,
        actorName: processorName,
        actorRole: 'authorizedProcessors',
        actorAddress: txRes.signerAddress,
        timestamp: nowStr,
        txHash: txRes.txHash,
        ipfsHash: ipfsRes.ipfsHash,
        imageUrl: checkpointImgPreview,
        geo: {
          lat: !Number.isNaN(parsedLat) ? parsedLat : targetProduct.geo.lat,
          lng: !Number.isNaN(parsedLng) ? parsedLng : targetProduct.geo.lng,
          locationName: `${processorName} (GPS: ${checkpointGps})`,
          capturedAt: nowStr,
        },
        extraSpecs: {
          'stageName': checkpointTitle,
          'locationGPS': checkpointGps,
          'พารามิเตอร์': roastOrProcessSpec,
        },
      };

      onCheckpointAdded(selectedTokenId, newCheckpoint);
      toast.success(`บันทึก Checkpoint ขั้นตอนที่ ${nextStepNum} ของ Product #${selectedTokenId} สำเร็จ!`, {
        id: toastId,
        duration: 4500,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เพิ่ม Checkpoint ไม่สำเร็จ', { id: toastId });
    } finally {
      setIsSubmittingCheckpoint(false);
    }
  };

  const handleCalculateMassBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingQuota(true);
    const toastId = toast.loading('กำลังคำนวณโควตา Mass Balance (_rawWeightKg * 2) และสร้างรหัส Unit...');
    try {
      const result = await generateMassBalanceQuotaCodes({
        tokenId: quotaTokenId,
        rawWeightKg: rawInputKg,
        bagWeightGrams: unitBagGrams,
        requestedBags: requestedBagUnits,
        yieldRatioPercent: yieldPercent,
        backendApiUrl,
      });
      onQuotaUpdated(quotaTokenId, result);
      if (result.isWithinQuota) {
        toast.success(
          `ผ่านเกณฑ์ On-Chain Mass Balance! อนุมัติโควตา ${result.requestedBags.toLocaleString()} ถุง (ไม่เกินเพดาน ${result.maxAllowedBags.toLocaleString()} ถุง)`,
          { id: toastId }
        );
      } else {
        toast.error(
          `Smart Contract Revert: จำนวนถุงที่ขอ (${result.requestedBags.toLocaleString()}) เกินโควตา rawWeightKg * 2 (${result.maxAllowedBags.toLocaleString()} ถุง)!`,
          { id: toastId, duration: 6000 }
        );
      }
    } finally {
      setIsGeneratingQuota(false);
    }
  };

  const selectedQuotaProduct = products.find((p) => p.tokenId === quotaTokenId) || products[0];
  const liveMaxAllowedBags = rawInputKg * 2;
  const isLiveOverQuota = requestedBagUnits > liveMaxAllowedBags;
  const isProducerFormOverQuota = category === 'batch' && plannedBagsCount > freshWeightKg * 2;

  return (
    <section aria-labelledby="portal-heading" className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 rounded-2xl p-6 sm:p-8 text-white shadow-lg border border-emerald-700/40">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 mb-3">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              หน้าจอที่ 1: Producer & Processor Portal (เชื่อมตรงกับ LaoTraceWeb3.sol)
            </span>
            <h1 id="portal-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
              ระบบลงทะเบียนผลผลิตต้นน้ำ & อัปเดตห่วงโซ่อุปทานกลางน้ำ
            </h1>
            <p className="text-emerald-100/90 text-sm sm:text-base mt-1.5 max-w-3xl">
              รองรับ <code>Category.AGRICULTURE (0)</code> (ตรวจสอบโควตาบนเชน{' '}
              <code>_requestedUnits &lt;= _rawWeightKg * 2</code>) และ{' '}
              <code>Category.HANDICRAFT (1)</code> (<code>maxUnits = 1</code>)
            </p>
          </div>

          <div className="flex flex-wrap gap-2 bg-slate-950/35 p-1.5 rounded-xl border border-white/10 self-start">
            <button
              type="button"
              onClick={() => setActiveSubTab('producer')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSubTab === 'producer'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <PackagePlus className="w-4 h-4" aria-hidden="true" />
              1. ลงทะเบียนต้นน้ำ (registerProduct)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('processor')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSubTab === 'processor'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <Factory className="w-4 h-4" aria-hidden="true" />
              2. อัปเดตแปรรูป (addCheckpoint)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('mass-balance')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeSubTab === 'mass-balance'
                  ? 'bg-white text-emerald-950 shadow-sm'
                  : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <Scale className="w-4 h-4" aria-hidden="true" />
              3. โควตา Mass Balance & QR
            </button>
          </div>
        </div>
      </div>

      {/* Offline Sync Queue Banner */}
      {offlineDrafts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
              <CloudOff className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950">
                พบข้อมูลที่บันทึกไว้แบบ Offline รอการ Sync ({offlineDrafts.length} รายการ)
              </h2>
              <p className="text-sm text-amber-800">
                ข้อมูลภาพถ่ายและพิกัด GPS ถูกเก็บไว้ในเครื่อง สามารถกด Sync ขึ้น IPFS และ{' '}
                <code>LaoTraceWeb3.sol</code> ได้ทันทีเมื่อมีสัญญาณอินเทอร์เน็ต
              </p>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {offlineDrafts.map((draft) => (
              <li
                key={draft.id}
                className="bg-white border border-amber-200 rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{draft.productName}</p>
                  <p className="text-xs text-slate-600">
                    พิกัด: {draft.geo.lat}, {draft.geo.lng} • บันทึกเมื่อ {draft.createdAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncOfflineDraft(draft)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  Sync ขึ้น Chain
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* TAB 1: PRODUCER ONBOARDING */}
      {activeSubTab === 'producer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Dynamic Onboarding Form (ลงทะเบียนสินค้าต้นน้ำ)
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  พารามิเตอร์ตรงกับ{' '}
                  <code>
                    registerProduct(_category, _name, _rootIpfsHash, _initialGPS, _rawWeightKg,
                    _requestedUnits)
                  </code>
                </p>
              </div>

              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleSelectCategory('batch')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    category === 'batch'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Coffee className="w-4 h-4" aria-hidden="true" />
                  AGRICULTURE (Batch)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCategory('craft')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    category === 'craft'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  HANDICRAFT (Unique)
                </button>
              </div>
            </div>

            <form onSubmit={handleRegisterProductSubmit} className="mt-6 space-y-6">
              <fieldset className="space-y-4">
                <legend className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  1. ข้อมูลชื่อสินค้า (_name) และผู้ผลิตต้นน้ำ
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="product-name" className="block text-sm font-semibold text-slate-800 mb-1">
                      ชื่อสินค้า (<code>_name</code>) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="product-name"
                      name="productName"
                      type="text"
                      required
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="producer-name" className="block text-sm font-semibold text-slate-800 mb-1">
                      ชื่อชาวสวน / ช่างทอ <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="producer-name"
                      name="producerName"
                      type="text"
                      required
                      value={producerName}
                      onChange={(e) => setProducerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600"
                    />
                  </div>
                </div>
              </fieldset>

              {category === 'batch' ? (
                <fieldset className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
                  <legend className="px-2 text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                    <Coffee className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    2. โหมดสินค้าเกษตร (Category.AGRICULTURE = 0)
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="crop-type" className="block text-sm font-semibold text-slate-800 mb-1">
                        ชนิดพืชเศรษฐกิจ <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="crop-type"
                        name="cropType"
                        value={cropType}
                        onChange={(e) => setCropType(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      >
                        <option value="กาแฟอาราบิก้า (Arabica Coffee)">กาแฟอาราบิก้า (Arabica Coffee - ปากซอง)</option>
                        <option value="กาแฟโรบัสต้า (Robusta Coffee)">กาแฟโรบัสต้า (Bolaven Robusta)</option>
                        <option value="ชาอัสสัมโบราณ (Assam Forest Tea)">ชาอัสสัมโบราณ (Assam Tea - พงสาลี)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="crop-variety" className="block text-sm font-semibold text-slate-800 mb-1">
                        สายพันธุ์ (Variety) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="crop-variety"
                        name="variety"
                        type="text"
                        required
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="elevation" className="block text-sm font-semibold text-slate-800 mb-1">
                        ความสูงแปลงปลูก (Elevation) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="elevation"
                        name="elevationMeters"
                        type="text"
                        required
                        value={elevationMeters}
                        onChange={(e) => setElevationMeters(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="fresh-weight" className="block text-sm font-semibold text-slate-800 mb-1">
                        น้ำหนักผลผลิตสด (<code>_rawWeightKg</code>) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="fresh-weight"
                        name="freshWeightKg"
                        type="number"
                        min={1}
                        required
                        value={freshWeightKg}
                        onChange={(e) => setFreshWeightKg(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="planned-bags" className="block text-sm font-semibold text-slate-800 mb-1">
                        จำนวนถุงในล็อต (<code>_requestedUnits</code> / <code>maxUnits</code>){' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="planned-bags"
                        name="plannedBagsCount"
                        type="number"
                        min={1}
                        required
                        value={plannedBagsCount}
                        onChange={(e) => setPlannedBagsCount(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                      <p
                        className={`text-xs mt-1.5 font-semibold ${
                          isProducerFormOverQuota ? 'text-red-600' : 'text-emerald-800'
                        }`}
                      >
                        กฎ On-Chain ใน <code>LaoTraceWeb3.sol</code>:{' '}
                        <code>require(_requestedUnits &lt;= _rawWeightKg * 2)</code> → น้ำหนักสด{' '}
                        {freshWeightKg} กก. ขายได้ไม่เกิน <strong>{freshWeightKg * 2} ถุง</strong>
                      </p>
                    </div>
                  </div>
                </fieldset>
              ) : (
                <fieldset className="bg-purple-50/60 border border-purple-200/80 rounded-2xl p-5 space-y-4">
                  <legend className="px-2 text-sm font-bold text-purple-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-700" aria-hidden="true" />
                    2. โหมดสินค้าหัตถกรรมผ้าไหม (Category.HANDICRAFT = 1, maxUnits = 1)
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="weaver-name" className="block text-sm font-semibold text-slate-800 mb-1">
                        ชื่อช่างทอ (Master Weaver) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="weaver-name"
                        name="weaverName"
                        type="text"
                        required
                        value={weaverName}
                        onChange={(e) => setWeaverName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="village-name" className="block text-sm font-semibold text-slate-800 mb-1">
                        หมู่บ้าน / แขวงแหล่งทอผ้า <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="village-name"
                        name="villageName"
                        type="text"
                        required
                        value={villageName}
                        onChange={(e) => setVillageName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="silk-type" className="block text-sm font-semibold text-slate-800 mb-1">
                        ชนิดเส้นไหม <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="silk-type"
                        name="silkType"
                        type="text"
                        required
                        value={silkType}
                        onChange={(e) => setSilkType(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="natural-dye" className="block text-sm font-semibold text-slate-800 mb-1">
                        วัตถุดิบย้อมสีธรรมชาติ (คราม, ครั่ง) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="natural-dye"
                        name="naturalDye"
                        type="text"
                        required
                        value={naturalDye}
                        onChange={(e) => setNaturalDye(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="ancient-pattern" className="block text-sm font-semibold text-slate-800 mb-1">
                        ชื่อลวดลายโบราณ <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="ancient-pattern"
                        name="ancientPattern"
                        type="text"
                        required
                        value={ancientPattern}
                        onChange={(e) => setAncientPattern(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="weaving-days" className="block text-sm font-semibold text-slate-800 mb-1">
                        ระยะเวลาที่ใช้ทอมือ (วัน) <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="weaving-days"
                        name="weavingDays"
                        type="number"
                        min={1}
                        required
                        value={weavingDays}
                        onChange={(e) => setWeavingDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="nfc-uid" className="block text-sm font-semibold text-slate-800 mb-1">
                        ผูก UID ของชิป NFC ประจำผืนผ้าไหม (<code>_rawWeightKg = 0, _requestedUnits = 1</code>)
                      </label>
                      <input
                        id="nfc-uid"
                        name="nfcUid"
                        type="text"
                        autocorrect="off"
                        autocapitalize="off"
                        spellcheck={false}
                        value={nfcUid}
                        onChange={(e) => setNfcUid(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              {/* 3. Geo-Tagged Media Upload */}
              <fieldset className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <legend className="px-2 text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  3. พิกัด GPS มือถือจริง (<code>_initialGPS</code>) & อัปโหลดรูปขึ้น Pinata IPFS (<code>_rootIpfsHash</code>)
                </legend>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                  >
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    ดึงพิกัด GPS จากมือถือจริง (navigator.geolocation)
                  </button>
                  {PRESET_LOCATIONS.map((loc) => (
                    <button
                      key={loc.label}
                      type="button"
                      onClick={() => {
                        setLat(loc.lat);
                        setLng(loc.lng);
                        setLocationName(loc.locationName);
                        setCapturedAt(new Date().toISOString().replace('T', ' ').slice(0, 19));
                        toast.success(`เลือกพิกัดจำลอง: ${loc.label}`);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="gps-lat" className="block text-xs font-semibold text-slate-600 mb-1">
                      ละติจูด (Latitude)
                    </label>
                    <input
                      id="gps-lat"
                      type="text"
                      readOnly
                      value={lat}
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="gps-lng" className="block text-xs font-semibold text-slate-600 mb-1">
                      ลองจิจูด (Longitude)
                    </label>
                    <input
                      id="gps-lng"
                      type="text"
                      readOnly
                      value={lng}
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="gps-time" className="block text-xs font-semibold text-slate-600 mb-1">
                      ค่า <code>_initialGPS</code> ที่ส่งเข้า Contract
                    </label>
                    <input
                      id="gps-time"
                      type="text"
                      readOnly
                      value={`${lat}, ${lng}`}
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-mono text-emerald-800 font-bold"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
                  <img
                    src={imagePreview}
                    alt="ตัวอย่างภาพถ่ายแปลงปลูกหรือการทอผ้า"
                    width={120}
                    height={90}
                    className="w-28 h-20 object-cover rounded-xl border border-slate-300 shrink-0"
                  />
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="producer-photo-upload"
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer transition shadow-sm"
                      >
                        <Camera className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        1. เลือกรูปถ่ายสวน / ผ้าไหม
                      </label>
                      <input
                        id="producer-photo-upload"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileChange(e, false)}
                        className="sr-only"
                      />

                      <button
                        type="button"
                        disabled={isUploadingRootIpfs}
                        onClick={handlePreUploadRootToPinata}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        {isUploadingRootIpfs
                          ? 'กำลังอัปโหลดขึ้น Pinata...'
                          : '2. อัปโหลดขึ้น Pinata.cloud เพื่อรับ CID ทันที'}
                      </button>
                    </div>

                    <div>
                      <label htmlFor="root-ipfs-cid" className="block text-[11px] font-bold text-slate-700 mb-1">
                        รหัส CID จาก Pinata/IPFS (<code>_rootIpfsHash</code>) — อัปโหลดอัตโนมัติหรือวางรหัส CID ได้:
                      </label>
                      <input
                        id="root-ipfs-cid"
                        type="text"
                        autocorrect="off"
                        autocapitalize="off"
                        spellCheck={false}
                        value={rootIpfsHashInput}
                        onChange={(e) => setRootIpfsHashInput(e.target.value)}
                        placeholder="เช่น QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco (จะสร้างให้อัตโนมัติตอนกด Mint หากเว้นว่าง)"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-emerald-900"
                      />
                    </div>
                  </div>
                </div>
              </fieldset>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveOffline}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 transition"
                >
                  <CloudOff className="w-4 h-4" aria-hidden="true" />
                  บันทึกแบบ Offline
                </button>
                <button
                  type="submit"
                  disabled={isMinting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
                >
                  {isMinting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                      กำลังส่งขึ้น IPFS & เรียก registerProduct()...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" aria-hidden="true" />
                      Mint สินค้าต้นน้ำขึ้น LAB Chain (registerProduct)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Instant QR Code Generator & Products List */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <QrCode className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    ระบบสร้างป้าย QR Code & ชิป NFC
                  </h3>
                  <p className="text-xs text-slate-500">
                    พร้อมสั่งพิมพ์แปะถุงกาแฟหรือป้ายผ้าไหมทันทีหลัง Mint
                  </p>
                </div>
              </div>

              {(() => {
                const displayProd = mintedProductResult || products[0];
                if (!displayProd) return null;
                const verifyUrl = `${window.location.origin}/verify/${displayProd.tokenId}`;
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-3">
                      Product ID #{displayProd.tokenId} •{' '}
                      {displayProd.category === 'batch' ? 'Category.AGRICULTURE' : 'Category.HANDICRAFT'}
                    </span>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                      <QRCodeSVG value={verifyUrl} size={168} level="H" includeMargin />
                    </div>
                    <h4 className="font-bold text-slate-900 mt-3 text-base">
                      {displayProd.productName}
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">{displayProd.producerName}</p>
                    <code className="mt-2 px-2.5 py-1 bg-slate-200/70 rounded text-[11px] font-mono text-slate-700 break-all">
                      {verifyUrl}
                    </code>

                    <div className="mt-4 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => openQrLabelDialog(displayProd)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        พิมพ์ป้าย QR แปะสินค้า
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenConsumerView(displayProd.tokenId)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        จำลองสแกนดูหน้าผู้บริโภค
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-slate-900 mb-3">
                รายการสินค้าต้นน้ำบน LAB Chain ({products.length} รายการ)
              </h3>
              <ul className="space-y-3">
                {products.map((prod) => (
                  <li
                    key={prod.tokenId}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-400 transition flex items-center justify-between gap-3 bg-slate-50/60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-900 text-white">
                          #{prod.tokenId}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                            prod.category === 'batch'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {prod.category === 'batch' ? 'AGRICULTURE' : 'HANDICRAFT'}
                        </span>
                        {prod.certification.isCertified && (
                          <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-100 text-amber-900">
                            isCertified
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-sm text-slate-900 truncate mt-1">
                        {prod.productName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {prod.checkpoints.length} ขั้นตอน • GPS: {prod.geo.lat}, {prod.geo.lng}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openQrLabelDialog(prod)}
                        className="p-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        aria-label={`เปิดป้าย QR ของสินค้า #${prod.tokenId}`}
                      >
                        <QrCode className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenConsumerView(prod.tokenId)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        ดู Timeline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROCESSOR CHECKPOINT FORM */}
      {activeSubTab === 'processor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900">
              ฟอร์มเพิ่มขั้นตอนกลางน้ำ (Add Supply Chain Checkpoint)
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              เรียกฟังก์ชัน{' '}
              <code>
                LaoTraceWeb3.addCheckpoint(_productId, _stageName, _locationGPS, _evidenceIpfsHash)
              </code>
            </p>

            <div className="mt-5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                เลือกเทมเพลตขั้นตอนการผลิตด่วน (Quick Presets):
              </span>
              <div className="flex flex-wrap gap-2">
                {CHECKPOINT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setCheckpointStage(preset.stageType);
                      setCheckpointTitle(preset.title);
                      setCheckpointDesc(preset.description);
                      setRoastOrProcessSpec(preset.specVal);
                      toast.success(`เลือกขั้นตอน: ${preset.label}`);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-800 hover:bg-emerald-50 hover:border-emerald-400 transition"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddCheckpointSubmit} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="checkpoint-token" className="block text-sm font-semibold text-slate-800 mb-1">
                    เลือกรหัสสินค้า (<code>_productId</code>) <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="checkpoint-token"
                    value={selectedTokenId}
                    onChange={(e) => setSelectedTokenId(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                  >
                    {products.map((p) => (
                      <option key={p.tokenId} value={p.tokenId}>
                        Product #{p.tokenId} — {p.productName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="checkpoint-gps" className="block text-sm font-semibold text-slate-800">
                      พิกัด GPS (<code>_locationGPS</code>) <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleCaptureCheckpointGps}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition"
                    >
                      <MapPin className="w-3 h-3" aria-hidden="true" />
                      ดึง GPS มือถือจริง
                    </button>
                  </div>
                  <input
                    id="checkpoint-gps"
                    type="text"
                    required
                    value={checkpointGps}
                    onChange={(e) => setCheckpointGps(e.target.value)}
                    placeholder="เช่น 15.1821, 106.2412"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="processor-name" className="block text-sm font-semibold text-slate-800 mb-1">
                    ชื่อโรงแปรรูป / สหกรณ์ / ผู้ส่งออก <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="processor-name"
                    type="text"
                    required
                    value={processorName}
                    onChange={(e) => setProcessorName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="process-spec" className="block text-sm font-semibold text-slate-800 mb-1">
                    ค่าพารามิเตอร์สำคัญ (เช่น ระดับการคั่ว / ความชื้น)
                  </label>
                  <input
                    id="process-spec"
                    type="text"
                    value={roastOrProcessSpec}
                    onChange={(e) => setRoastOrProcessSpec(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="checkpoint-title" className="block text-sm font-semibold text-slate-800 mb-1">
                  ชื่อขั้นตอนการแปรรูป (<code>_stageName</code>) <span className="text-red-500">*</span>
                </label>
                <input
                  id="checkpoint-title"
                  type="text"
                  required
                  value={checkpointTitle}
                  onChange={(e) => setCheckpointTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="checkpoint-desc" className="block text-sm font-semibold text-slate-800 mb-1">
                  รายละเอียดการแปรรูป / ตรวจสอบคุณภาพ <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="checkpoint-desc"
                  rows={3}
                  required
                  value={checkpointDesc}
                  onChange={(e) => setCheckpointDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <img
                    src={checkpointImgPreview}
                    alt="ภาพหลักฐานขั้นตอนกลางน้ำ"
                    width={96}
                    height={72}
                    className="w-24 h-18 object-cover rounded-lg border border-slate-300 shrink-0"
                  />
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="checkpoint-photo"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        1. เลือกรูปหลักฐานการคั่ว/ย้อม
                      </label>
                      <input
                        id="checkpoint-photo"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, true)}
                        className="sr-only"
                      />

                      <button
                        type="button"
                        disabled={isUploadingCheckpointIpfs}
                        onClick={handlePreUploadCheckpointToPinata}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        {isUploadingCheckpointIpfs
                          ? 'กำลังอัปโหลดขึ้น Pinata...'
                          : '2. อัปโหลดขึ้น Pinata.cloud เพื่อรับ CID ทันที'}
                      </button>
                    </div>

                    <div>
                      <label htmlFor="checkpoint-ipfs-cid" className="block text-[11px] font-bold text-slate-700 mb-1">
                        รหัส CID จาก Pinata/IPFS (<code>_evidenceIpfsHash</code>):
                      </label>
                      <input
                        id="checkpoint-ipfs-cid"
                        type="text"
                        autocorrect="off"
                        autocapitalize="off"
                        spellCheck={false}
                        value={evidenceIpfsHashInput}
                        onChange={(e) => setEvidenceIpfsHashInput(e.target.value)}
                        placeholder="เช่น QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco (จะสร้างให้อัตโนมัติหากเว้นว่าง)"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-emerald-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingCheckpoint}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
              >
                {isSubmittingCheckpoint ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    กำลังอัปโหลด IPFS & บันทึก addCheckpoint() บน LAB Chain...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    บันทึกขั้นตอนลง Blockchain (contract.addCheckpoint)
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {(() => {
              const target = products.find((p) => p.tokenId === selectedTokenId) || products[0];
              if (!target) return null;
              return (
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <span className="text-xs font-bold text-emerald-700 uppercase">
                        Product ID #{target.tokenId}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">{target.productName}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenConsumerView(target.tokenId)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
                    >
                      เปิดหน้าผู้บริโภค
                    </button>
                  </div>

                  <p className="text-xs font-semibold text-slate-500 mt-4 mb-3">
                    ประวัติ productTimelines[{target.tokenId}] ปัจจุบัน ({target.checkpoints.length} ขั้นตอน):
                  </p>
                  <ol className="relative border-s-2 border-emerald-200 ms-3 space-y-4">
                    {target.checkpoints.map((cp) => (
                      <li key={cp.stepNumber} className="ms-5">
                        <span className="absolute -start-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white ring-4 ring-white">
                          {cp.stepNumber}
                        </span>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          <p className="text-xs font-bold text-slate-900">{cp.title}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            GPS: {cp.geo.lat}, {cp.geo.lng}
                          </p>
                          <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500 font-mono">
                            <span>{cp.timestamp}</span>
                            <a
                              href={getExplorerTxUrl(cp.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:underline"
                            >
                              Tx: {cp.txHash.slice(0, 10)}...
                            </a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 3: MASS BALANCE CALCULATOR */}
      {activeSubTab === 'mass-balance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                <Scale className="w-5 h-5" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                On-Chain Mass Balance Calculator
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              ตรงกับเงื่อนไขบน Smart Contract (<code>LaoTraceWeb3.sol</code>):{' '}
              <code>require(_requestedUnits &lt;= _rawWeightKg * 2)</code> เพื่อป้องกันการนำกาแฟเกรดต่ำมาสวมรอย
            </p>

            <form onSubmit={handleCalculateMassBalance} className="mt-6 space-y-4">
              <div>
                <label htmlFor="quota-token" className="block text-sm font-semibold text-slate-800 mb-1">
                  เลือกล็อตสินค้าเกษตร (<code>_productId</code>)
                </label>
                <select
                  id="quota-token"
                  value={quotaTokenId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setQuotaTokenId(id);
                    const found = products.find((p) => p.tokenId === id);
                    if (found?.batchData) {
                      setRawInputKg(found.batchData.freshWeightKg);
                      setUnitBagGrams(found.batchData.bagWeightGrams);
                      setRequestedBagUnits(found.batchData.plannedBagsCount);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                >
                  {products.map((p) => (
                    <option key={p.tokenId} value={p.tokenId}>
                      Product #{p.tokenId} — {p.productName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="raw-kg" className="block text-sm font-semibold text-slate-800 mb-1">
                    น้ำหนักผลผลิตสด <code>_rawWeightKg</code> (กก.)
                  </label>
                  <input
                    id="raw-kg"
                    type="number"
                    min={1}
                    value={rawInputKg}
                    onChange={(e) => setRawInputKg(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="req-bags" className="block text-sm font-semibold text-slate-800 mb-1">
                    จำนวนถุงที่ขอ <code>_requestedUnits</code> (ถุง)
                  </label>
                  <input
                    id="req-bags"
                    type="number"
                    min={1}
                    value={requestedBagUnits}
                    onChange={(e) => setRequestedBagUnits(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div
                className={`p-4 rounded-2xl border ${
                  isLiveOverQuota
                    ? 'bg-red-50 border-red-300 text-red-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                  <span>กฎ Mass Balance บน LaoTraceWeb3.sol</span>
                  <span>{isLiveOverQuota ? 'เกินโควตา (Smart Contract Revert!)' : 'ผ่านเกณฑ์ On-Chain'}</span>
                </div>
                <p className="text-sm mt-2">
                  น้ำหนักสด <strong>{rawInputKg.toLocaleString()} กก.</strong> × 2 = โควตาสูงสุดบนเชน{' '}
                  <strong className="underline">{liveMaxAllowedBags.toLocaleString()} ถุง</strong> (คุณขอออกรหัส{' '}
                  <strong>{requestedBagUnits.toLocaleString()} ถุง</strong>)
                </p>
              </div>

              <button
                type="submit"
                disabled={isGeneratingQuota}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition"
              >
                <QrCode className="w-4 h-4" aria-hidden="true" />
                คำนวณโควตา & สร้างรหัส Unit Serial + PIN รายถุง
              </button>
            </form>
          </div>

          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  รหัส QR Code รายถุง (Unit #1 .. maxUnits) & รหัส PIN
                </h3>
                <p className="text-xs text-slate-500">
                  เชื่อมกับ <code>claimUnit(_productId, _unitNumber)</code> และ{' '}
                  <code>isUnitClaimed</code> บน Smart Contract
                </p>
              </div>
              {selectedQuotaProduct && (
                <button
                  type="button"
                  onClick={() => openQrLabelDialog(selectedQuotaProduct)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                  พิมพ์ใบปะหน้าทั้งหมด
                </button>
              )}
            </div>

            {selectedQuotaProduct?.quota ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedQuotaProduct.quota.generatedUnits.map((unit) => (
                  <div
                    key={unit.unitCode}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-xs font-bold font-mono text-slate-900">
                        {unit.unitCode}
                      </span>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">PIN ขูด:</span>
                        <code className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-mono text-xs font-bold">
                          {unit.pinCode}
                        </code>
                      </div>
                      <span
                        className={`inline-block mt-1.5 text-[11px] font-semibold ${
                          unit.isClaimed ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {unit.isClaimed ? 'isUnitClaimed = true' : 'isUnitClaimed = false'}
                      </span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                      <QRCodeSVG
                        value={`${window.location.origin}${unit.qrVerifyUrl}`}
                        size={58}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                กดปุ่ม "คำนวณโควตา & สร้างรหัส Unit Serial" ด้านซ้ายเพื่อสร้างป้ายรายถุง
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable QR Code Label Modal */}
      <dialog
        ref={qrDialogRef}
        closedby="any"
        className="rounded-2xl p-0 max-w-lg w-full shadow-2xl border border-slate-200 bg-white text-slate-900"
      >
        {qrModalProduct && (
          <div className="p-6">
            <div id="printable-qr-area" className="border-2 border-slate-900 rounded-2xl p-6 text-center bg-white">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                LAOTRACEWEB3 • LAB CHAIN VERIFIED (CHAIN ID: 5222)
              </p>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {qrModalProduct.productName}
              </h3>
              <p className="text-xs text-slate-600">{qrModalProduct.producerName}</p>

              <div className="my-4 inline-block p-3 bg-white border border-slate-300 rounded-2xl">
                <QRCodeSVG
                  value={`${window.location.origin}/verify/${qrModalProduct.tokenId}`}
                  size={180}
                  level="H"
                  includeMargin
                />
              </div>

              <p className="text-xs font-mono text-slate-700">
                productId: #{qrModalProduct.tokenId} • GPS: {qrModalProduct.geo.lat}, {qrModalProduct.geo.lng}
              </p>

              {qrModalProduct.quota?.generatedUnits?.[0] && (
                <div className="mt-3 p-2.5 bg-amber-50 border border-dashed border-amber-400 rounded-xl">
                  <p className="text-xs font-semibold text-amber-900">
                    Unit #1 • รหัส PIN ขูดยืนยันของแท้:{' '}
                    <code className="font-mono font-bold text-sm">
                      {qrModalProduct.quota.generatedUnits[0].pinCode}
                    </code>
                  </p>
                </div>
              )}

              {qrModalProduct.craftData?.nfcUid && (
                <div className="mt-3 p-2.5 bg-purple-50 border border-dashed border-purple-400 rounded-xl">
                  <p className="text-xs font-semibold text-purple-900 flex items-center justify-center gap-1">
                    <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
                    Unique Item (maxUnits = 1) • NFC: <code className="font-mono">{qrModalProduct.craftData.nfcUid}</code>
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                สั่งพิมพ์ป้าย (Print)
              </button>
              <form method="dialog">
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  ปิดหน้าต่าง
                </button>
              </form>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
};
