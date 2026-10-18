import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import {
  Camera,
  CheckCircle2,
  CloudOff,
  Coffee,
  ExternalLink,
  Factory,
  MapPin,
  PackagePlus,
  Printer,
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
  activeRole?: 'producer' | 'processor';
  onNavigateToRole?: (role: 'producer' | 'processor') => void;
  onProductRegistered: (newProduct: TraceableProduct) => void;
  onCheckpointAdded: (tokenId: number, checkpoint: CheckpointMetadata) => void;
  onQuotaUpdated: (tokenId: number, quota: QuotaCalculationResult) => void;
  onSaveOfflineDraft: (draft: OfflineDraftItem) => void;
  onRemoveOfflineDraft: (draftId: string) => void;
  onOpenConsumerView: (tokenId: number) => void;
}

const PRESET_LOCATIONS = [
  {
    label: '☕ ປາກຊອງ (Paksong)',
    lat: 15.1764,
    lng: 106.2338,
    locationName: 'ເມືອງປາກຊອງ ແຂວງຈຳປາສັກ (Paksong, Bolaven Plateau 1,280m)',
  },
  {
    label: '🧣 ຫຼວງພະບາງ (Luang Prabang)',
    lat: 19.8856,
    lng: 102.1347,
    locationName: 'ບ້ານໂພນງາມ ແຂວງຫຼວງພະບາງ (Phon Ngam, Luang Prabang)',
  },
  {
    label: '🍵 ຜົ້ງສາລີ (Phongsaly)',
    lat: 21.6833,
    lng: 102.1058,
    locationName: 'ບ້ານກໍແໝ່ງ ແຂວງຜົ້ງສາລີ (Komen, Phongsaly 1,620m)',
  },
];

const CHECKPOINT_PRESETS = [
  {
    label: '💧 ສີປຽກ & ຕາກແຫ້ງ (Washed Process)',
    stageType: 'processing' as const,
    title: 'ສີປຽກ ແລະ ຕາກແຫ້ງສຳເລັດ (Washed & Sun-Dried 11.2%)',
    description:
      'ລ້າງດ້ວຍນ້ຳແຮ່ທຳມະຊາດ ໝັກ 36 ຊົ່ວໂມງ ແລະ ຕາກເທິງຮ້ານຍົກສູງ 14 ມື້ (Fully washed & sun-dried to 11.2% moisture).',
    specVal: 'Fully Washed (Moisture 11.2%)',
  },
  {
    label: '🔥 ຂົ້ວລະດັບກາງ (Medium Roast)',
    stageType: 'roasting_dyeing' as const,
    title: 'ຂົ້ວກາເຟລະດັບກາງ & ບັນຈຸຖົງ (Medium Roast & Packaged)',
    description:
      'ຂົ້ວລະດັບກາງ ຫອມກິ່ນດອກໄມ້ປ່າ ແລະ ຊັອກໂກແລັດ Cupping Score 86.5 (Artisan Medium Roast).',
    specVal: 'Medium Roast (Cupping 86.5)',
  },
  {
    label: '🎨 ຍ້ອມຄາມທຳມະຊາດ (Natural Indigo Dyeing)',
    stageType: 'roasting_dyeing' as const,
    title: 'ຍ້ອມສີຄາມທຳມະຊາດ & ຕໍ່າຫູກສຳເລັດ (Natural Dyeing & Weaving)',
    description:
      'ຍ້ອມໝໍ້ຄາມທຳມະຊາດ 12 ຮອບ ປອດສານເຄມີ 100% (100% organic natural indigo dyeing).',
    specVal: '100% Natural Indigo Dye',
  },
  {
    label: '📦 ກວດກາຄຸນນະພາບ & ສົ່ງອອກ (QC & Export)',
    stageType: 'export' as const,
    title: 'ຜ່ານການກວດກາຄຸນນະພາບ & ພ້ອມສົ່ງອອກ (QC Passed & Ready for Export)',
    description:
      'ກວດກາຄຸນນະພາບມາດຕະຖານສົ່ງອອກ ແລະ ຕິດປ້າຍ QR / NFC ສຳເລັດ (Export quality verified).',
    specVal: 'Export QC Passed',
  },
];

export const ProducerProcessorPortal: React.FC<ProducerProcessorPortalProps> = ({
  products,
  offlineDrafts,
  architectureMode,
  contractAddress,
  backendApiUrl,
  activeRole = 'producer',
  onNavigateToRole,
  onProductRegistered,
  onCheckpointAdded,
  onQuotaUpdated,
  onSaveOfflineDraft,
  onRemoveOfflineDraft,
  onOpenConsumerView,
}) => {
  const currentRole = activeRole;

  // Step 1: Producer Onboarding State
  const [category, setCategory] = useState<ProductCategory>('batch');
  const [productName, setProductName] = useState(
    'ກາເຟອາຣາບິກ້າ ປາກຊອງ (Paksong Single-Origin Arabica)'
  );
  const [producerName, setProducerName] = useState(
    'ກຸ່ມຊາວສວນກາເຟອິນຊີ ບ້ານຫຼັກ 40 (Paksong Organic Farmers)'
  );

  // Agriculture Batch Fields
  const [cropType, setCropType] = useState('ກາເຟອາຣາບິກ້າ (Arabica Coffee)');
  const [variety, setVariety] = useState('Typica & Bourbon');
  const [elevationMeters, setElevationMeters] = useState('1,280m above sea level');
  const [freshWeightKg, setFreshWeightKg] = useState<number>(500);
  const [plannedBagsCount, setPlannedBagsCount] = useState<number>(800);
  const [bagWeightGrams, setBagWeightGrams] = useState<number>(250);

  // Handicraft Silk Fields
  const [weaverName, setWeaverName] = useState('ແມ່ຄູບົວໄຂ ວົງລະຄອນ (Master Weaver Bouakhai)');
  const [villageName, setVillageName] = useState('ບ້ານໂພນງາມ ແຂວງຫຼວງພະບາງ (Luang Prabang)');
  const [silkType, setSilkType] = useState('ໄໝນ້ອຍສາວມືພື້ນເມືອງ 100% (Native Hand-Reeled Silk)');
  const [naturalDye, setNaturalDye] = useState('ຄາມທຳມະຊາດ & ຄັ່ງປ່າ (Natural Indigo & Lac)');
  const [ancientPattern, setAncientPattern] = useState('ລາຍນາກໂຂງບູຮານ (Mekong Naga Motif)');
  const [weavingDays, setWeavingDays] = useState<number>(21);
  const [nfcUid, setNfcUid] = useState('NFC-UID-04:B8:3C:91:7A:22:80');

  // GPS & IPFS Photo State
  const [lat, setLat] = useState<number>(15.1764);
  const [lng, setLng] = useState<number>(106.2338);
  const [locationName, setLocationName] = useState(
    'ເມືອງປາກຊອງ ແຂວງຈຳປາສັກ (Paksong, Bolaven Plateau 1,280m)'
  );
  const [capturedAt, setCapturedAt] = useState<string>(() =>
    new Date().toISOString().replace('T', ' ').slice(0, 19)
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80'
  );
  const [rootIpfsHashInput, setRootIpfsHashInput] = useState<string>('');
  const [isUploadingRootIpfs, setIsUploadingRootIpfs] = useState<boolean>(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedProductResult, setMintedProductResult] = useState<TraceableProduct | null>(null);

  // Step 2: Processor Checkpoint State
  const [selectedTokenId, setSelectedTokenId] = useState<number>(products[0]?.tokenId || 1);
  const [checkpointCodeInput, setCheckpointCodeInput] = useState<string>(
    `LT-2026-${String(products[0]?.tokenId || 1).padStart(3, '0')}`
  );
  const [checkpointStage, setCheckpointStage] = useState<
    'processing' | 'roasting_dyeing' | 'qc' | 'export'
  >('processing');
  const [checkpointTitle, setCheckpointTitle] = useState(
    'ສີປຽກ ແລະ ຕາກແຫ້ງສຳເລັດ (Washed & Sun-Dried 11.2%)'
  );
  const [checkpointDesc, setCheckpointDesc] = useState(
    'ລ້າງດ້ວຍນ້ຳແຮ່ທຳມະຊາດ ໝັກ 36 ຊົ່ວໂມງ ແລະ ຕາກເທິງຮ້ານຍົກສູງ 14 ມື້ (Fully washed & sun-dried to 11.2% moisture).'
  );
  const [processorName, setProcessorName] = useState(
    'ສະຫະກອນກາເຟປາກຊອງ (Bolaven Wet Mill Co-op)'
  );
  const [checkpointGps, setCheckpointGps] = useState('15.1821, 106.2412');
  const [roastOrProcessSpec, setRoastOrProcessSpec] = useState('Moisture 11.2% / Grade A');
  const [checkpointFile, setCheckpointFile] = useState<File | null>(null);
  const [checkpointImgPreview, setCheckpointImgPreview] = useState<string>(
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80'
  );
  const [evidenceIpfsHashInput, setEvidenceIpfsHashInput] = useState<string>('');
  const [isUploadingCheckpointIpfs, setIsUploadingCheckpointIpfs] = useState<boolean>(false);
  const [isSubmittingCheckpoint, setIsSubmittingCheckpoint] = useState(false);

  // Step 3: Mass Balance Quota State
  const [quotaTokenId, setQuotaTokenId] = useState<number>(1);
  const [rawInputKg, setRawInputKg] = useState<number>(500);
  const [yieldPercent, setYieldPercent] = useState<number>(80);
  const [unitBagGrams, setUnitBagGrams] = useState<number>(250);
  const [requestedBagUnits, setRequestedBagUnits] = useState<number>(800);
  const [isGeneratingQuota, setIsGeneratingQuota] = useState(false);

  const qrDialogRef = useRef<HTMLDialogElement | null>(null);
  const [qrModalProduct, setQrModalProduct] = useState<TraceableProduct | null>(null);

  const retailDialogRef = useRef<HTMLDialogElement | null>(null);
  const [retailModalProduct, setRetailModalProduct] = useState<TraceableProduct | null>(null);

  const openQrLabelDialog = (prod: TraceableProduct) => {
    setQrModalProduct(prod);
    if (qrDialogRef.current && typeof qrDialogRef.current.showModal === 'function') {
      qrDialogRef.current.showModal();
    }
  };

  const openRetailStickersDialog = (prod: TraceableProduct) => {
    setRetailModalProduct(prod);
    if (retailDialogRef.current && typeof retailDialogRef.current.showModal === 'function') {
      retailDialogRef.current.showModal();
    }
  };

  const handleSelectCategory = (nextCat: ProductCategory) => {
    setCategory(nextCat);
    if (nextCat === 'batch') {
      setProductName('ກາເຟອາຣາບິກ້າ ປາກຊອງ (Paksong Single-Origin Arabica)');
      setProducerName('ກຸ່ມຊາວສວນກາເຟອິນຊີ ບ້ານຫຼັກ 40 (Paksong Organic Farmers)');
      setLat(15.1764);
      setLng(106.2338);
      setLocationName('ເມືອງປາກຊອງ ແຂວງຈຳປາສັກ (Paksong, Bolaven Plateau 1,280m)');
      setImagePreview(
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80'
      );
    } else {
      setProductName('ຜ້າໄໝລາວຕໍ່າດ້ວຍມື ຍ້ອມຄາມທຳມະຊາດ (Luang Prabang Handwoven Silk)');
      setProducerName('ແມ່ຄູບົວໄຂ ວົງລະຄອນ (ບ້ານໂພນງາມ ຫຼວງພະບາງ)');
      setLat(19.8856);
      setLng(102.1347);
      setLocationName('ບ້ານໂພນງາມ ແຂວງຫຼວງພະບາງ (Phon Ngam, Luang Prabang)');
      setImagePreview(
        'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80'
      );
    }
  };

  // Real Mobile GPS Capture via navigator.geolocation.getCurrentPosition()
  const handleCaptureGps = () => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setCapturedAt(nowStr);

    if (!navigator.geolocation) {
      toast.error('ເບຣາວ໌ເຊີບໍ່ຮອງຮັບ GPS (Geolocation not supported)');
      return;
    }

    const loadingId = toast.loading('📍 ກຳລັງດຶງພິກັດ GPS ຈາກມືຖື... (Getting GPS coordinates...)');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss(loadingId);
        const newLat = Number(pos.coords.latitude.toFixed(5));
        const newLng = Number(pos.coords.longitude.toFixed(5));
        setLat(newLat);
        setLng(newLng);
        setLocationName(`ພິກັດ GPS ຕົວຈິງ (${newLat}, ${newLng})`);
        toast.success(`ດຶງພິກັດ GPS ສຳເລັດ! (${newLat}, ${newLng})`);
      },
      () => {
        toast.dismiss(loadingId);
        toast.success(`ໃຊ້ພິກັດສວນ (${lat}, ${lng}) • ${nowStr}`);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleCaptureCheckpointGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

    const loadingId = toast.loading('📍 ກຳລັງດຶງພິກັດ GPS ປັດຈຸບັນ... (Getting GPS...)');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss(loadingId);
        const newLat = Number(pos.coords.latitude.toFixed(5));
        const newLng = Number(pos.coords.longitude.toFixed(5));
        const formatted = `${newLat}, ${newLng}`;
        setCheckpointGps(formatted);
        toast.success(`ດຶງພິກັດ GPS ສຳເລັດ: ${formatted}`);
      },
      () => {
        toast.dismiss(loadingId);
        toast.error('ບໍ່ສາມາດດຶງ GPS ໄດ້ ກະລຸນາອະນຸຍາດ Location (Please allow location access)');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Upload to Pinata.cloud / IPFS
  const handlePreUploadRootToPinata = async () => {
    setIsUploadingRootIpfs(true);
    const toastId = toast.loading('ກຳລັງອັບໂຫຼດຮູບຂຶ້ນ Pinata IPFS... (Uploading to IPFS...)');
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
      toast.success(`ອັບໂຫຼດສຳເລັດ! CID: ${res.ipfsHash.slice(0, 18)}...`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'IPFS Upload Failed', { id: toastId });
    } finally {
      setIsUploadingRootIpfs(false);
    }
  };

  const handlePreUploadCheckpointToPinata = async () => {
    setIsUploadingCheckpointIpfs(true);
    const toastId = toast.loading('ກຳລັງອັບໂຫຼດຮູບຫຼັກຖານຂຶ້ນ Pinata IPFS...');
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
      toast.success(`ອັບໂຫຼດສຳເລັດ! CID: ${res.ipfsHash.slice(0, 18)}...`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'IPFS Upload Failed', { id: toastId });
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
        toast.success('ເລືອກຮູບພາບສຳເລັດ! (Photo Selected)');
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
    toast.success('ບັນທຶກແບບ Offline ສຳເລັດ! (Saved Offline Draft)');
  };

  const handleRegisterProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (category === 'batch' && plannedBagsCount > freshWeightKg * 2) {
      toast.error(
        `ເກີນໂຄວຕາ! ນ້ຳໜັກສົດ ${freshWeightKg} kg ສ້າງໄດ້ສູງສຸດ ${
          freshWeightKg * 2
        } ຖົງ (Quota Exceeded: Max ${freshWeightKg * 2} bags)`
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
          ? `${cropType} (${variety}) • ນ້ຳໜັກສົດ ${freshWeightKg} kg • ໂຄວຕາ ${plannedBagsCount} ຖົງ`
          : `ຜ້າໄໝຕໍ່າດ້ວຍມື ໂດຍ ${weaverName} (${villageName}) • ຍ້ອມສີ ${naturalDye} • ລາຍ ${ancientPattern}`,
      category: category === 'batch' ? 'AGRICULTURE' : 'HANDICRAFT',
      producerName,
      initialGPS: initialGpsString,
      rawWeightKg: category === 'batch' ? freshWeightKg : 0,
      maxUnits: category === 'batch' ? plannedBagsCount : 1,
      geo: { lat, lng, locationName, capturedAt: nowStr },
    };

    const toastId = toast.loading('1/2 ກຳລັງອັບໂຫຼດຮູບຂຶ້ນ Pinata IPFS... (Uploading to IPFS...)');
    try {
      const ipfsRes = rootIpfsHashInput.trim()
        ? { ipfsHash: rootIpfsHashInput.trim() }
        : await uploadMetadataToIpfs(selectedFile, metadataPayload, backendApiUrl);
      setRootIpfsHashInput(ipfsRes.ipfsHash);

      toast.loading(
        `2/2 ກຳລັງບັນທຶກຂຶ້ນ LAB Chain... (Calling registerProduct on Blockchain...)`,
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
                ? `1. ເກັບກ່ຽວຜົນຜະລິດຢູ່ສວນ (Harvested at Origin • ${freshWeightKg} kg)`
                : `1. ຕໍ່າຫູກດ້ວຍມື (Handwoven by Artisan • ${ancientPattern})`,
            description: metadataPayload.description,
            actorName: producerName,
            actorRole: 'Producer (ຜູ້ຜະລິດຕົ້ນນ້ຳ)',
            actorAddress: txRes.signerAddress,
            timestamp: nowStr,
            txHash: txRes.txHash,
            ipfsHash: ipfsRes.ipfsHash,
            imageUrl: imagePreview,
            geo: { lat, lng, locationName, capturedAt: nowStr },
            extraSpecs:
              category === 'batch'
                ? {
                    Category: 'AGRICULTURE',
                    'Raw Weight': `${freshWeightKg} kg`,
                    'Batch Units': `${plannedBagsCount} Bags`,
                  }
                : {
                    Category: 'HANDICRAFT',
                    Edition: '1 Unique Item',
                    'NFC Tag': nfcUid,
                  },
          },
        ],
        certification: {
          isCertified: false,
          certIpfsHash: '',
          certPdfUrl: '',
          certStandard: 'ລໍຖ້າການກວດສອບມາດຕະຖານ Lao Organic / GI (Pending Certification)',
          certifierOrganization: 'ກົມກະສິກຳ (DOA) / Lao GI Board',
          certifierAddress: '',
          certifiedAt: '',
          txHash: '',
          inspectorNote: 'ລໍຖ້າຜູ້ກວດສອບມາດຕະຖານກົດອະນຸມັດ (Waiting for Certifier Approval)',
        },
        quota: quotaRes,
      };

      onProductRegistered(newProduct);
      setMintedProductResult(newProduct);
      setSelectedTokenId(newProduct.tokenId);
      setCheckpointCodeInput(`LT-2026-${String(newProduct.tokenId).padStart(3, '0')}`);
      setQuotaTokenId(newProduct.tokenId);

      toast.success(
        `ສ້າງລະຫັດສິນຄ້າ LT-2026-${String(finalId).padStart(3, '0')} ສຳເລັດ! (Product Code Generated)`,
        { id: toastId, duration: 5000 }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      toast.error(msg, { id: toastId });
    } finally {
      setIsMinting(false);
    }
  };

  const handleSyncOfflineDraft = async (draft: OfflineDraftItem) => {
    const toastId = toast.loading(`ກຳລັງ Sync "${draft.productName}" ຂຶ້ນ LAB Chain...`);
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
            title: '1. ລົງທະບຽນຕົ້ນນ້ຳ (Synced from Offline Draft)',
            description: `GPS: ${draft.geo.lat}, ${draft.geo.lng} • ${draft.geo.capturedAt}`,
            actorName: draft.producerName,
            actorRole: 'Producer',
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
          certStandard: 'ລໍຖ້າການກວດສອບ Lao Organic / GI (Pending)',
          certifierOrganization: 'ກົມກະສິກຳ (DOA)',
          certifierAddress: '',
          certifiedAt: '',
          txHash: '',
          inspectorNote: 'Pending audit',
        },
      };

      onProductRegistered(syncedProduct);
      onRemoveOfflineDraft(draft.id);
      setMintedProductResult(syncedProduct);
      toast.success(`Sync ສິນຄ້າ #${nextTokenId} ສຳເລັດ!`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed', { id: toastId });
    }
  };

  const handleAddCheckpointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProduct = products.find((p) => p.tokenId === selectedTokenId);
    if (!targetProduct) {
      toast.error('Product not found');
      return;
    }

    setIsSubmittingCheckpoint(true);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const nextStepNum = targetProduct.checkpoints.length + 1;

    const toastId = toast.loading('1/2 ກຳລັງອັບໂຫຼດຮູບຫຼັກຖານຂຶ້ນ Pinata IPFS...');
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

      toast.loading(`2/2 ກຳລັງບັນທຶກຂັ້ນຕອນລົງ LAB Chain... (Calling addCheckpoint...)`, {
        id: toastId,
      });

      const txRes = await callAddCheckpointOnChain({
        tokenId: selectedTokenId,
        stageName: checkpointTitle,
        locationGPS: checkpointGps,
        ipfsHash: ipfsRes.ipfsHash,
        mode: architectureMode,
        contractAddress,
        backendApiUrl,
      });

      const [parsedLat, parsedLng] = checkpointGps.split(',').map((s) => Number(s.trim()));

      const newCheckpoint: CheckpointMetadata = {
        stepNumber: nextStepNum,
        stageType: checkpointStage,
        title: `${nextStepNum}. ${checkpointTitle}`,
        description: checkpointDesc,
        actorName: processorName,
        actorRole: 'Processor (ໂຮງແປຮູບ)',
        actorAddress: txRes.signerAddress,
        timestamp: nowStr,
        txHash: txRes.txHash,
        ipfsHash: ipfsRes.ipfsHash,
        imageUrl: checkpointImgPreview,
        geo: {
          lat: !Number.isNaN(parsedLat) ? parsedLat : targetProduct.geo.lat,
          lng: !Number.isNaN(parsedLng) ? parsedLng : targetProduct.geo.lng,
          locationName: `${processorName} (${checkpointGps})`,
          capturedAt: nowStr,
        },
        extraSpecs: {
          Stage: checkpointTitle,
          Spec: roastOrProcessSpec,
        },
      };

      onCheckpointAdded(selectedTokenId, newCheckpoint);
      toast.success(
        `ເພີ່ມຂັ້ນຕອນທີ ${nextStepNum} ສຳເລັດ! (Checkpoint #${nextStepNum} Added)`,
        { id: toastId, duration: 4500 }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add checkpoint', {
        id: toastId,
      });
    } finally {
      setIsSubmittingCheckpoint(false);
    }
  };

  const handleCalculateMassBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingQuota(true);
    const toastId = toast.loading('ກຳລັງຄິດໄລ່ໂຄວຕາ & ສ້າງລະຫັດ PIN... (Calculating Quota...)');
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
          `ຜ່ານເກນໂຄວຕາ! ອະນຸມັດ ${result.requestedBags.toLocaleString()} ຖົງ (Approved within ${result.maxAllowedBags.toLocaleString()} limit)`,
          { id: toastId }
        );
      } else {
        toast.error(
          `ເກີນໂຄວຕາ! ຂໍ ${result.requestedBags.toLocaleString()} ຖົງ ແຕ່ສູງສຸດໄດ້ ${result.maxAllowedBags.toLocaleString()} ຖົງ`,
          { id: toastId, duration: 6000 }
        );
      }
    } finally {
      setIsGeneratingQuota(false);
    }
  };

  const selectedCheckpointProduct =
    products.find((p) => p.tokenId === selectedTokenId) || products[0];
  const selectedQuotaProduct = products.find((p) => p.tokenId === quotaTokenId) || products[0];
  const liveMaxAllowedBags = rawInputKg * 2;
  const isLiveOverQuota = requestedBagUnits > liveMaxAllowedBags;
  const isProducerFormOverQuota = category === 'batch' && plannedBagsCount > freshWeightKg * 2;

  return (
    <section aria-labelledby="portal-heading" className="space-y-8">
      {/* Role-Specific Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 mb-2">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {currentRole === 'producer'
                ? '🌱 ໜ້າຈໍທີ 1 • ຕົ້ນນ້ຳ (Upstream Producer)'
                : '🏭 ໜ້າຈໍທີ 2 • ກາງນ້ຳ (Midstream Processor)'}
            </span>
            <h1 id="portal-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {currentRole === 'producer'
                ? 'ລົງທະບຽນສິນຄ້າຕົ້ນນ້ຳ (Register Origin Product)'
                : 'ອັບເດດຂັ້ນຕອນການແປຮູບ & ບັນຈຸ (Processing & Packaging)'}
            </h1>
            <p className="text-emerald-100/90 text-sm mt-1">
              {currentRole === 'producer'
                ? 'ສຳລັບຊາວສວນກາເຟ ຫຼື ຊ່າງທໍຜ້າໄໝ ບັນທຶກຜົນຜະລິດ, ດຶງພິກັດ GPS ມືຖື ແລະ ຮັບລະຫັດສິນຄ້າ (Product Code)'
                : 'ປ້ອນລະຫັດສິນຄ້າທີ່ໄດ້ຮັບຈາກຊາວສວນຕົ້ນນ້ຳ ເພື່ອດຶງຂໍ້ມູນສວນ ແລະ ບັນທຶກຂັ້ນຕອນການແປຮູບລົງ Blockchain'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {currentRole === 'producer' ? (
              <button
                type="button"
                onClick={() => onNavigateToRole?.('processor')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-emerald-950 hover:bg-emerald-50 transition shadow-sm"
              >
                <Factory className="w-3.5 h-3.5" aria-hidden="true" />
                ໄປໜ້າໂຮງງານແປຮູບ ➡️
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateToRole?.('producer')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition border border-white/20"
              >
                ⬅️ ກັບໄປໜ້າຊາວສວນຕົ້ນນ້ຳ
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Offline Drafts Banner */}
      {offlineDrafts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
              <CloudOff className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950">
                ຂໍ້ມູນທີ່ບັນທຶກໄວ້ຕອນບໍ່ມີອິນເຕີເນັດ • Offline Drafts ({offlineDrafts.length})
              </h2>
              <p className="text-xs text-amber-800">
                ກົດປຸ່ມ Sync ເພື່ອສົ່ງຂໍ້ມູນຂຶ້ນ IPFS ແລະ Blockchain ທັນທີທີ່ມີສັນຍານເນັດ
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
                  <p className="font-bold text-sm text-slate-900 truncate">{draft.productName}</p>
                  <p className="text-xs text-slate-600">
                    GPS: {draft.geo.lat}, {draft.geo.lng} • {draft.createdAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSyncOfflineDraft(draft)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  Sync Now
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===================================================================
          STEP 1: PRODUCER ONBOARDING (ລົງທະບຽນສິນຄ້າຕົ້ນນ້ຳ)
         =================================================================== */}
      {currentRole === 'producer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left 7 Cols: Easy 3-Part Form */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-extrabold text-slate-900">
              ລົງທະບຽນສິນຄ້າຕົ້ນນ້ຳ (Register Origin Product)
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              ເລືອກປະເພດສິນຄ້າ, ດຶງພິກັດ GPS ຈາກມືຖື ແລະ ອັບໂຫຼດຮູບພາບຂຶ້ນ Pinata IPFS
            </p>

            {/* Big Visual Category Selector */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectCategory('batch')}
                className={`p-4 rounded-2xl border-2 text-start transition flex items-start gap-3 ${
                  category === 'batch'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl ${
                    category === 'batch'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Coffee className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-extrabold text-sm text-slate-900">
                    ສິນຄ້າກະສິກຳ (Agriculture Batch)
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    ກາເຟ, ຊາ, ຜົນຜະລິດເປັນລ็อต (Coffee, Tea, Crops)
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectCategory('craft')}
                className={`p-4 rounded-2xl border-2 text-start transition flex items-start gap-3 ${
                  category === 'craft'
                    ? 'border-purple-600 bg-purple-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl ${
                    category === 'craft'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Sparkles className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-extrabold text-sm text-slate-900">
                    ຫັດຖະກຳຜ້າໄໝ (Handicraft Item)
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    ຜ້າໄໝຕໍ່າດ້ວຍມື 1 ຜືນ 1 ລະຫັດ (Unique Silk Piece)
                  </p>
                </div>
              </button>
            </div>

            <form onSubmit={handleRegisterProductSubmit} className="mt-6 space-y-6">
              {/* Part 1: Basic Info */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
                <h3 className="text-sm font-extrabold text-slate-900">
                  1. ຂໍ້ມູນສິນຄ້າ & ຜູ້ຜະລິດ (Product & Producer Info)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="product-name"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      ຊື່ສິນຄ້າ (Product Name) *
                    </label>
                    <input
                      id="product-name"
                      type="text"
                      required
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="producer-name"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      ຊື່ຊາວສວນ / ຊ່າງຕໍ່າຫູກ (Producer Name) *
                    </label>
                    <input
                      id="producer-name"
                      type="text"
                      required
                      value={producerName}
                      onChange={(e) => setProducerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                    />
                  </div>
                </div>

                {category === 'batch' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label
                        htmlFor="crop-variety"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        ສາຍພັນ (Variety) & ຄວາມສູງ (Elevation)
                      </label>
                      <input
                        id="crop-variety"
                        type="text"
                        required
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fresh-weight"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        ນ້ຳໜັກຜົນຜະລິດສົດ • Harvest Weight (kg) *
                      </label>
                      <input
                        id="fresh-weight"
                        type="number"
                        min={1}
                        required
                        value={freshWeightKg}
                        onChange={(e) => setFreshWeightKg(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="planned-bags"
                          className="block text-xs font-bold text-slate-700"
                        >
                          ຈຳນວນຖົງທີ່ຕ້ອງການບັນຈຸຂາຍ • Number of Bags (Units) *
                        </label>
                        <span
                          className={`text-xs font-bold ${
                            isProducerFormOverQuota ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          ໂຄວຕາສູງສຸດ (Max Quota): {freshWeightKg * 2} ຖົງ
                        </span>
                      </div>
                      <input
                        id="planned-bags"
                        type="number"
                        min={1}
                        required
                        value={plannedBagsCount}
                        onChange={(e) => setPlannedBagsCount(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900"
                      />
                      <p
                        className={`text-xs mt-1.5 font-medium ${
                          isProducerFormOverQuota ? 'text-red-600' : 'text-slate-600'
                        }`}
                      >
                        {isProducerFormOverQuota
                          ? `⚠️ ຈຳນວນຖົງເກີນໂຄວຕາ! ນ້ຳໜັກ ${freshWeightKg} kg ບັນຈຸຂາຍໄດ້ບໍ່ເກີນ ${
                              freshWeightKg * 2
                            } ຖົງ`
                          : `✅ ຜ່ານເກນ Mass Balance: ນ້ຳໜັກສົດ ${freshWeightKg} kg ຂາຍໄດ້ສູງສຸດ ${
                              freshWeightKg * 2
                            } ຖົງ`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label
                        htmlFor="natural-dye"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        ສີຍ້ອມທຳມະຊາດ (Natural Dye)
                      </label>
                      <input
                        id="natural-dye"
                        type="text"
                        required
                        value={naturalDye}
                        onChange={(e) => setNaturalDye(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ancient-pattern"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        ລວດລາຍຜ້າໄໝ (Silk Motif / Pattern)
                      </label>
                      <input
                        id="ancient-pattern"
                        type="text"
                        required
                        value={ancientPattern}
                        onChange={(e) => setAncientPattern(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="nfc-uid"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        ລະຫັດຊິບ NFC ປະຈຳຜືນຜ້າໄໝ (NFC Tag UID • 1 Unique Piece)
                      </label>
                      <input
                        id="nfc-uid"
                        type="text"
                        autocorrect="off"
                        autocapitalize="off"
                        spellCheck={false}
                        value={nfcUid}
                        onChange={(e) => setNfcUid(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Part 2: 1-Click Mobile GPS Location */}
              <div className="bg-emerald-50/60 rounded-2xl p-5 border border-emerald-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-emerald-950 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                      2. ພິກັດ GPS ແຫຼ່ງຜະລິດ (GPS Origin Location)
                    </h3>
                    <p className="text-xs text-emerald-800">
                      ກົດປຸ່ມເພື່ອດຶງພິກັດຈາກມືຖືຕົວຈິງ ຫຼື ເລືອກພື້ນທີ່ຕົວຢ່າງ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
                  >
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    📍 ດຶງພິກັດ GPS ຈາກມືຖື (Get My GPS)
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {PRESET_LOCATIONS.map((loc) => (
                    <button
                      key={loc.label}
                      type="button"
                      onClick={() => {
                        setLat(loc.lat);
                        setLng(loc.lng);
                        setLocationName(loc.locationName);
                        toast.success(`ເລືອກພິກັດ: ${loc.label}`);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 transition"
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>

                <div className="bg-white rounded-xl p-3 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 font-medium">{locationName}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold">
                    GPS: {lat}, {lng}
                  </span>
                </div>
              </div>

              {/* Part 3: Photo & Pinata IPFS Upload */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  3. ຮູບພາບສິນຄ້າ & ອັບໂຫຼດຂຶ້ນ Pinata IPFS (Photo & IPFS Hash)
                </h3>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <img
                    src={imagePreview}
                    alt="Product Preview"
                    width={120}
                    height={90}
                    className="w-28 h-20 object-cover rounded-xl border border-slate-300 shrink-0"
                  />
                  <div className="flex-1 space-y-2.5 w-full">
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="producer-photo-upload"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer shadow-sm"
                      >
                        <Camera className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        1. ເລືອກຮູບພາບ (Choose Photo)
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
                          ? 'ກຳລັງອັບໂຫຼດ... (Uploading...)'
                          : '2. ອັບໂຫຼດຂຶ້ນ Pinata IPFS (Get CID)'}
                      </button>
                    </div>

                    <input
                      id="root-ipfs-cid"
                      type="text"
                      autocorrect="off"
                      autocapitalize="off"
                      spellCheck={false}
                      value={rootIpfsHashInput}
                      onChange={(e) => setRootIpfsHashInput(e.target.value)}
                      placeholder="IPFS CID (ເຊັ່ນ QmXoy... ລະບົບຈະສ້າງໃຫ້ອັດຕະໂນມັດຖ້າປະຫວ່າງໄວ້)"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveOffline}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-xs sm:text-sm font-bold border border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100 transition"
                >
                  <CloudOff className="w-4 h-4" aria-hidden="true" />
                  ບັນທຶກແບບ Offline (Save Draft)
                </button>
                <button
                  type="submit"
                  disabled={isMinting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
                >
                  {isMinting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ກຳລັງບັນທຶກຂຶ້ນ Blockchain & ສ້າງລະຫັດສິນຄ້າ...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" aria-hidden="true" />
                      ບັນທຶກຂຶ້ນ Blockchain & ສ້າງລະຫັດສິນຄ້າ (Register & Generate Code)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right 5 Cols: Instant Product Code Card & Product List */}
          <div className="lg:col-span-5 space-y-6">
            {/* Product Code Card (ແທນ QR Code) */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                  <Sparkles className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    ລະຫັດສິນຄ້າຕົ້ນນ້ຳ (Origin Product Code)
                  </h3>
                  <p className="text-xs text-slate-500">
                    ສ້າງອັດຕະໂນມັດຫຼັງລົງທະບຽນ ເຊື່ອມກັບ <code>productId</code> ເທິງ Blockchain
                  </p>
                </div>
              </div>

              {(() => {
                const displayProd = mintedProductResult || products[0];
                if (!displayProd) return null;
                const formattedCode = `LT-2026-${String(displayProd.tokenId).padStart(3, '0')}`;
                return (
                  <div className="bg-slate-50 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                        On-Chain ID #{displayProd.tokenId}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {displayProd.category === 'batch' ? '🌾 ກະສິກຳ (Batch)' : '🧣 ຫັດຖະກຳ (Craft)'}
                      </span>
                    </div>

                    {/* Prominent Product Code Box */}
                    <div className="bg-slate-900 text-white p-4 rounded-2xl border border-emerald-500/30 text-center space-y-2">
                      <p className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold">
                        ລະຫັດສິນຄ້າສຳລັບສົ່ງຕໍ່ໂຮງງານ & ຜູ້ບໍລິໂພກ (Product Code)
                      </p>
                      <p className="text-2xl sm:text-3xl font-mono font-extrabold tracking-widest text-amber-300">
                        {formattedCode}
                      </p>
                      <p className="text-xs text-slate-300">
                        (ຫຼື ໃຊ້ເລກໄອດີສັ້ນ: <strong className="text-white">#{displayProd.tokenId}</strong>)
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(formattedCode);
                          toast.success(`ຄັດລອກລະຫັດສິນຄ້າ ${formattedCode} ແລ້ວ! (Copied)`);
                        }}
                        className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition"
                      >
                        📋 ຄັດລອກລະຫັດສິນຄ້າ (Copy Code)
                      </button>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">
                        {displayProd.productName}
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        ຜູ້ຜະລິດ: {displayProd.producerName}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-1">
                        ໂຄວຕາ (maxUnits):{' '}
                        {displayProd.category === 'batch'
                          ? `${displayProd.batchData?.plannedBagsCount || displayProd.quota?.maxAllowedBags || 0} ຖົງ`
                          : `1 ຜືນ (${displayProd.craftData?.nfcUid || 'Unique Item'})`}
                      </p>
                    </div>

                    {/* Sample Generated Bag PIN Codes */}
                    {displayProd.quota?.generatedUnits && displayProd.quota.generatedUnits.length > 0 && (
                      <div className="bg-white rounded-xl p-3 border border-slate-200 space-y-1.5">
                        <p className="text-[11px] font-bold text-slate-700">
                          ລະຫັດ PIN ລາຍຖົງທີ່ສ້າງພ້ອມກັນ (Sample Bag PIN Codes):
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {displayProd.quota.generatedUnits.slice(0, 4).map((u, idx) => (
                            <div
                              key={u.unitCode}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-mono flex items-center justify-between"
                            >
                              <span className="font-bold text-slate-700">ຖົງ #{idx + 1}:</span>
                              <strong className="text-emerald-800">{u.pinCode}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => openQrLabelDialog(displayProd)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        ພິມໃບລະຫັດສິນຄ້າ (Print Code)
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenConsumerView(displayProd.tokenId)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        ກວດສອບລະຫັດນີ້ (Verify Code)
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTokenId(displayProd.tokenId);
                        setCheckpointCodeInput(formattedCode);
                        onNavigateToRole?.('processor');
                        toast.success(
                          `ສົ່ງລະຫັດ ${formattedCode} ໄປຂັ້ນຕອນທີ 2 (ໂຮງງານແປຮູບ) ແລ້ວ!`
                        );
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold bg-amber-400 text-slate-950 hover:bg-amber-300 transition shadow-sm"
                    >
                      <Factory className="w-4 h-4" aria-hidden="true" />
                      ➡️ ນຳລະຫັດ {formattedCode} ໄປຂັ້ນຕອນທີ 2: ໂຮງງານແປຮູບ (Send to Processor)
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Registered Products List */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-base font-extrabold text-slate-900 mb-3">
                ລາຍການລະຫັດສິນຄ້າໃນລະບົບ • Registered Products ({products.length})
              </h3>
              <ul className="space-y-3">
                {products.map((prod) => {
                  const codeStr = `LT-2026-${String(prod.tokenId).padStart(3, '0')}`;
                  return (
                    <li
                      key={prod.tokenId}
                      className="p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-400 transition flex items-center justify-between gap-3 bg-slate-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-slate-900 text-amber-300">
                            {codeStr}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                              prod.category === 'batch'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {prod.category === 'batch' ? '☕ ກະສິກຳ' : '🧣 ຜ້າໄໝ'}
                          </span>
                          {prod.certification.isCertified && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-100 text-amber-900">
                              ✓ GI / Organic
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-sm text-slate-900 truncate mt-1">
                          {prod.productName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          ID #{prod.tokenId} • {prod.checkpoints.length} ຂັ້ນຕອນ • GPS: {prod.geo.lat},{' '}
                          {prod.geo.lng}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openQrLabelDialog(prod)}
                          className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          ໃບລະຫັດ
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenConsumerView(prod.tokenId)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          ເບິ່ງປະຫວັດ
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          STEP 2: PROCESSOR CHECKPOINT FORM (ອັບເດດຂັ້ນຕອນການແປຮູບ)
         =================================================================== */}
      {currentRole === 'processor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-extrabold text-slate-900">
              ເພີ່ມຂັ້ນຕອນການແປຮູບ (Add Processing Step)
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              ນຳ <strong>ລະຫັດສິນຄ້າຕົ້ນນ້ຳ (ເຊັ່ນ LT-2026-001)</strong> ທີ່ຊາວສວນສົ່ງມາປ້ອນໃສ່ ເພື່ອເຊື່ອມຂໍ້ມູນການແປຮູບເຂົ້າກັບສວນຕົ້ນນ້ຳເທິງ Blockchain
            </p>

            {/* Quick Presets */}
            <div className="mt-5">
              <span className="block text-xs font-bold text-slate-600 mb-2">
                ⚡ ເລືອກຂັ້ນຕອນດ່ວນ (Quick Stage Templates):
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
                      toast.success(`ເລືອກຂັ້ນຕອນ: ${preset.label}`);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 border border-slate-300 text-slate-800 hover:bg-emerald-50 hover:border-emerald-400 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddCheckpointSubmit} className="mt-6 space-y-5">
              {/* Origin Product Code Lookup & Verification Box */}
              <div className="bg-emerald-50/70 border-2 border-emerald-500/40 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="checkpoint-code-input"
                      className="block text-xs font-extrabold text-emerald-950 mb-1"
                    >
                      1. ປ້ອນລະຫັດສິນຄ້າຈາກຕົ້ນນ້ຳ (Enter Origin Code) *
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id="checkpoint-code-input"
                        type="text"
                        autocorrect="off"
                        autocapitalize="off"
                        spellCheck={false}
                        value={checkpointCodeInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCheckpointCodeInput(val);
                          const parts = val.trim().match(/\d+/g);
                          const num = parts && parts.length > 0 ? Number(parts[parts.length - 1]) : NaN;
                          const matched = products.find((p) => p.tokenId === num);
                          if (matched) {
                            setSelectedTokenId(matched.tokenId);
                          }
                        }}
                        placeholder="ເຊັ່ນ LT-2026-001 ຫຼື 1"
                        className="w-full rounded-xl border border-emerald-400 bg-white px-3 py-2 text-sm font-mono font-extrabold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="checkpoint-token"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      ຫຼື ເລືອກຈາກລາຍການຕົ້ນນ້ຳ (Or Select from List)
                    </label>
                    <select
                      id="checkpoint-token"
                      value={selectedTokenId}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setSelectedTokenId(id);
                        setCheckpointCodeInput(`LT-2026-${String(id).padStart(3, '0')}`);
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                    >
                      {products.map((p) => (
                        <option key={p.tokenId} value={p.tokenId}>
                          LT-2026-{String(p.tokenId).padStart(3, '0')} — {p.productName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Full Upstream Recorded Data Card (ຂໍ້ມູນທີ່ຕົ້ນນ້ຳບັນທຶກໄວ້) */}
                {selectedCheckpointProduct && (
                  <div className="bg-white rounded-2xl p-4 border border-emerald-300 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        ຂໍ້ມູນທີ່ຕົ້ນນ້ຳບັນທຶກໄວ້ (Upstream Recorded Data)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-amber-300 text-xs font-mono font-bold">
                        ລະຫັດ: LT-2026-{String(selectedCheckpointProduct.tokenId).padStart(3, '0')} (ID #{selectedCheckpointProduct.tokenId})
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 text-xs">
                      <img
                        src={selectedCheckpointProduct.heroImageUrl}
                        alt={selectedCheckpointProduct.productName}
                        width={88}
                        height={68}
                        className="w-22 h-16 object-cover rounded-xl border border-slate-200 shrink-0"
                      />
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-slate-900 truncate">
                          {selectedCheckpointProduct.productName}
                        </p>
                        <p className="text-slate-600">
                          ຜູ້ຜະລິດຕົ້ນນ້ຳ (Producer): <strong>{selectedCheckpointProduct.producerName}</strong>
                        </p>
                        <p className="text-slate-600">
                          ພິກັດສວນຕົ້ນນ້ຳ (Origin GPS):{' '}
                          <strong className="font-mono text-emerald-800">
                            {selectedCheckpointProduct.geo.lat}, {selectedCheckpointProduct.geo.lng}
                          </strong>{' '}
                          ({selectedCheckpointProduct.geo.locationName})
                        </p>
                        {selectedCheckpointProduct.category === 'batch' &&
                          selectedCheckpointProduct.batchData && (
                            <p className="text-slate-700">
                              ສາຍພັນ: <strong>{selectedCheckpointProduct.batchData.variety}</strong> •
                              ນ້ຳໜັກສົດຕົ້ນນ້ຳ:{' '}
                              <strong>{selectedCheckpointProduct.batchData.freshWeightKg} kg</strong> •
                              ໂຄວຕາ: <strong>{selectedCheckpointProduct.batchData.plannedBagsCount} ຖົງ</strong>
                            </p>
                          )}
                        {selectedCheckpointProduct.category === 'craft' &&
                          selectedCheckpointProduct.craftData && (
                            <p className="text-slate-700">
                              ຊະນິດໄໝ: <strong>{selectedCheckpointProduct.craftData.silkType}</strong> •
                              ສີຍ້ອມ: <strong>{selectedCheckpointProduct.craftData.naturalDye}</strong> •
                              ລາຍ: <strong>{selectedCheckpointProduct.craftData.ancientPattern}</strong>
                            </p>
                          )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="checkpoint-gps"
                      className="block text-xs font-bold text-slate-700"
                    >
                      ພິກັດ GPS ໂຮງງານແປຮູບ (Factory GPS) *
                    </label>
                    <button
                      type="button"
                      onClick={handleCaptureCheckpointGps}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition"
                    >
                      <MapPin className="w-3 h-3" aria-hidden="true" />
                      📍 ດຶງ GPS
                    </button>
                  </div>
                  <input
                    id="checkpoint-gps"
                    type="text"
                    required
                    value={checkpointGps}
                    onChange={(e) => setCheckpointGps(e.target.value)}
                    placeholder="15.1821, 106.2412"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="processor-name"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    ຊື່ໂຮງງານ / ສະຫະກອນ (Processor Name) *
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
                  <label
                    htmlFor="process-spec"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    ລາຍລະອຽດເຕັກນິກ (Roast Level / Moisture)
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
                <label
                  htmlFor="checkpoint-title"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  ຊື່ຂັ້ນຕອນການຜະລິດ (Stage Name) *
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
                <label
                  htmlFor="checkpoint-desc"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  ຄຳອະທິບາຍຂັ້ນຕອນ (Step Description) *
                </label>
                <textarea
                  id="checkpoint-desc"
                  rows={2}
                  required
                  value={checkpointDesc}
                  onChange={(e) => setCheckpointDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              {/* Photo & Pinata IPFS */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <img
                    src={checkpointImgPreview}
                    alt="Processing Evidence"
                    width={96}
                    height={72}
                    className="w-24 h-18 object-cover rounded-xl border border-slate-300 shrink-0"
                  />
                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="checkpoint-photo"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        1. ເລືອກຮູບຫຼັກຖານ (Choose Photo)
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
                          ? 'ກຳລັງອັບໂຫຼດ...'
                          : '2. ອັບໂຫຼດຂຶ້ນ Pinata IPFS (Get CID)'}
                      </button>
                    </div>

                    <input
                      id="checkpoint-ipfs-cid"
                      type="text"
                      autocorrect="off"
                      autocapitalize="off"
                      spellCheck={false}
                      value={evidenceIpfsHashInput}
                      onChange={(e) => setEvidenceIpfsHashInput(e.target.value)}
                      placeholder="IPFS CID (ເຊັ່ນ QmXoy... ລະບົບສ້າງໃຫ້ອັດຕະໂນມັດຖ້າປະຫວ່າງໄວ້)"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingCheckpoint}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
              >
                {isSubmittingCheckpoint ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ກຳລັງບັນທຶກຂັ້ນຕອນລົງ Blockchain...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    ບັນທຶກຂັ້ນຕອນລົງ Blockchain (Save Checkpoint)
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right 5 Cols: Current Timeline Preview */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            {(() => {
              const target = products.find((p) => p.tokenId === selectedTokenId) || products[0];
              if (!target) return null;
              return (
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <span className="text-xs font-bold text-emerald-700 uppercase">
                        Product #{target.tokenId}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900">{target.productName}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenConsumerView(target.tokenId)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800"
                    >
                      ເບິ່ງໜ້າຜູ້ບໍລິໂພກ
                    </button>
                  </div>

                  <p className="text-xs font-bold text-slate-500 mt-4 mb-3">
                    ປະຫວັດຂັ້ນຕອນປັດຈຸບັນ • Current Timeline ({target.checkpoints.length} Steps):
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

                  {/* Packaging Scratch PINs for Midstream */}
                  {target.quota && target.quota.generatedUnits.length > 0 && (
                    <div className="mt-6 pt-5 border-t border-slate-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div>
                          <span className="text-xs font-extrabold text-slate-900 block">
                            🏷️ ລະຫັດ PIN ຂູດກັນປອມປະຈຳຖົງ (Packaging Scratch PINs)
                          </span>
                          <span className="text-[11px] text-slate-500">
                            ໂຄວຕາບັນຈຸທັງໝົດ {target.quota.generatedUnits.length} ຖົງ (ແຕ່ລະຖົງມີ QR Code + PIN ສະເພາະ)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRetailStickersDialog(target)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition shrink-0"
                        >
                          <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                          ພິມສະຕິກເກີ QR ຂາຍຈິງ
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-3">
                        ລະຫັດ PIN 6 ຕົວເລກສຳລັບຂັ້ນຕອນບັນຈຸຫີບຫໍ່ (ສຳລັບຜູ້ບໍລິໂພກຂູດກວດສອບຂອງແທ້)
                      </p>
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {target.quota.generatedUnits.map((u, idx) => (
                          <div
                            key={u.unitCode}
                            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-mono font-bold text-slate-800">
                              #{idx + 1} {u.unitCode}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded">
                                PIN: {u.pinCode}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  u.isClaimed
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {u.isClaimed ? 'Claimed' : 'Active'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Printable Product Code Modal */}
      <dialog
        ref={qrDialogRef}
        closedby="any"
        className="rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 bg-white text-slate-900"
      >
        {qrModalProduct && (
          <div>
            <div
              id="printable-qr-area"
              className="p-5 border-2 border-dashed border-emerald-600 rounded-2xl text-center space-y-3"
            >
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-900">
                LAOTRACE VERIFIED • ID #{qrModalProduct.tokenId}
              </span>
              <h3 className="text-lg font-extrabold text-slate-900">
                {qrModalProduct.productName}
              </h3>
              <p className="text-xs text-slate-600">{qrModalProduct.producerName}</p>

              <div className="my-3 p-4 bg-slate-900 text-white rounded-2xl border border-emerald-500/40">
                <p className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold">
                  ລະຫັດສິນຄ້າຕົ້ນນ້ຳ (Product Code)
                </p>
                <p className="text-2xl font-mono font-extrabold tracking-widest text-amber-300 mt-1">
                  LT-2026-{String(qrModalProduct.tokenId).padStart(3, '0')}
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  On-Chain Product ID: #{qrModalProduct.tokenId}
                </p>
              </div>

              {qrModalProduct.quota?.generatedUnits && (
                <div className="text-start bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <p className="text-[11px] font-bold text-slate-700">
                    ລະຫັດ PIN ປະຈຳຖົງ (Unit Scratch PINs):
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {qrModalProduct.quota.generatedUnits.map((u, idx) => (
                      <div
                        key={u.unitCode}
                        className="px-2 py-1 rounded bg-white border border-slate-200 text-[11px] font-mono flex justify-between"
                      >
                        <span>ຖົງ #{idx + 1}:</span>
                        <strong className="text-emerald-800">{u.pinCode}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs font-mono text-slate-700">
                GPS: {qrModalProduct.geo.lat}, {qrModalProduct.geo.lng}
              </p>
              <p className="text-[11px] text-emerald-800 font-bold">
                ນຳລະຫັດສິນຄ້າໄປຄົ້ນຫາເພື່ອກວດສອບແຫຼ່ງທີ່ມາ & ປ້ອນ PIN ຢືນຢັນຂອງແທ້
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                ພິມໃບລະຫັດສິນຄ້າ (Print Code)
              </button>
              <form method="dialog">
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-800 hover:bg-slate-300"
                >
                  ປິດ (Close)
                </button>
              </form>
            </div>
          </div>
        )}
      </dialog>

      {/* Retail Unit QR Code Stickers Sheet Modal */}
      <dialog
        ref={retailDialogRef}
        closedby="any"
        className="rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-slate-200 bg-white text-slate-900"
      >
        {retailModalProduct && (
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-900">
                  RETAIL PACKAGING LABELS • ລັອດ #{retailModalProduct.tokenId}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  ໃບສະຕິກເກີ QR Code ຂາຍຈິງສຳລັບຕິດຖົງບັນຈຸ (Retail QR Code Stickers)
                </h3>
                <p className="text-xs text-slate-500">
                  ແຕ່ລະຖົງຈະມີ QR Code ສະເພາະ (ເຊື່ອມຕໍ່ຫາ /product/{retailModalProduct.tokenId}/unit/[ເລກຖົງ]) + ລະຫັດ PIN ຂູດກັນປອມ
                </p>
              </div>
              <form method="dialog">
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  ✕ ປິດ
                </button>
              </form>
            </div>

            <div
              id="printable-retail-stickers-area"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-2"
            >
              {(retailModalProduct.quota?.generatedUnits || [
                { unitCode: `LT-U-1`, pinCode: '884920', isClaimed: false },
              ]).map((u, idx) => {
                const unitNum = idx + 1;
                const unitUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/product/${retailModalProduct.tokenId}/unit/${unitNum}`;
                return (
                  <div
                    key={u.unitCode}
                    className="p-3.5 border-2 border-dashed border-emerald-500/50 rounded-2xl bg-emerald-50/30 flex flex-col items-center text-center space-y-2 shadow-sm"
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                      LaoTrace Authentic • ຖົງ #{unitNum}
                    </span>
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">
                      {retailModalProduct.productName}
                    </p>
                    <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-inner">
                      <QRCodeSVG value={unitUrl} size={110} level="M" />
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 truncate w-full">
                      /product/{retailModalProduct.tokenId}/unit/{unitNum}
                    </p>
                    <div className="w-full bg-slate-900 text-amber-300 rounded-lg p-1.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-slate-300 font-bold">
                        🔒 ລະຫັດຂູດກັນປອມ (Scratch PIN)
                      </p>
                      <p className="text-sm font-mono font-black tracking-widest mt-0.5">
                        {u.pinCode}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                ພິມໃບສະຕິກເກີທັງໝົດ (Print Stickers Sheet)
              </button>
              <form method="dialog">
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-800 hover:bg-slate-300"
                >
                  ປິດ (Close)
                </button>
              </form>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
};
