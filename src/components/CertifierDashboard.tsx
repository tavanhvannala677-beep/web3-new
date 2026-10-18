import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Award,
  CheckCircle2,
  Clock,
  Coffee,
  ExternalLink,
  Factory,
  FileCheck,
  FileText,
  Layers,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sprout,
  Upload,
} from 'lucide-react';
import {
  ArchitectureMode,
  CertificationRecord,
  TraceableProduct,
} from '../types/traceability';
import {
  callCertifyProductOnChain,
  uploadMetadataToIpfs,
} from '../services/apiAndWeb3Service';
import { getExplorerTxUrl, resolveIpfsUrl } from '../config/labChain';

interface CertifierDashboardProps {
  products: TraceableProduct[];
  architectureMode: ArchitectureMode;
  contractAddress: string;
  backendApiUrl: string;
  onProductCertified: (tokenId: number, certRecord: CertificationRecord) => void;
  onOpenConsumerView: (tokenId: number) => void;
}

export const CertifierDashboard: React.FC<CertifierDashboardProps> = ({
  products,
  architectureMode,
  contractAddress,
  backendApiUrl,
  onProductCertified,
  onOpenConsumerView,
}) => {
  const pendingProducts = products.filter((p) => !p.certification.isCertified);
  const certifiedProducts = products.filter((p) => p.certification.isCertified);

  const [selectedTokenId, setSelectedTokenId] = useState<number>(
    pendingProducts[0]?.tokenId || products[0]?.tokenId || 3
  );
  const [certStandard, setCertStandard] = useState(
    '100% Verified Lao Organic & GI (ມາດຕະຖານກະສິກຳອິນຊີ & ຖິ່ນກຳເນີດ GI)'
  );
  const [certifierOrg, setCertifierOrg] = useState(
    'ກົມກະສິກຳ (Department of Agriculture - DOA) & Lao GI Board'
  );
  const [inspectorNote, setInspectorNote] = useState(
    'ຜ່ານການກວດວິເຄາະດິນ ແຫຼ່ງນ້ຳ ປາສະຈາກສານເຄມີຕົກຄ້າງ 100% ແລະ ຢູ່ໃນເຂດພິກັດ GI ແທ້ (100% Chemical-Free & Verified GI Origin)'
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('Lao_Organic_GI_Certificate_2026.pdf');
  const [certIpfsHashInput, setCertIpfsHashInput] = useState<string>('');
  const [isUploadingCertIpfs, setIsUploadingCertIpfs] = useState<boolean>(false);
  const [isCertifying, setIsCertifying] = useState(false);
  const [auditViewTab, setAuditViewTab] = useState<'timeline' | 'form'>('timeline');

  const selectedProduct =
    products.find((p) => p.tokenId === selectedTokenId) || products[0];

  const handlePdfUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setPdfFileName(file.name);
    toast.success(`ເລືອກໄຟລ໌ໃບຢັ້ງຢືນ: ${file.name} ແລ້ວ (File attached)`);
  };

  const handlePreUploadCertToPinata = async () => {
    if (!selectedProduct) return;
    setIsUploadingCertIpfs(true);
    const toastId = toast.loading(
      `ກຳລັງອັບໂຫຼດໃບຢັ້ງຢືນ (${pdfFileName}) ຂຶ້ນ Pinata (IPFS)...`
    );
    try {
      const res = await uploadMetadataToIpfs(
        pdfFile,
        {
          documentType: 'Official Organic & GI Certificate PDF',
          fileName: pdfFileName,
          tokenId: selectedProduct.tokenId,
          productName: selectedProduct.productName,
          certStandard,
          certifierOrganization: certifierOrg,
        },
        backendApiUrl
      );
      setCertIpfsHashInput(res.ipfsHash);
      toast.success(`ອັບໂຫຼດຂຶ້ນ IPFS ສຳເລັດ! CID: ${res.ipfsHash.slice(0, 18)}...`, {
        id: toastId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ອັບໂຫຼດ IPFS ບໍ່ສຳເລັດ', {
        id: toastId,
      });
    } finally {
      setIsUploadingCertIpfs(false);
    }
  };

  const handleCertifyOnChain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setIsCertifying(true);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const toastId = toast.loading(
      `1/2 ກຳລັງອັບໂຫຼດໃບຢັ້ງຢືນຂຶ້ນ IPFS (Uploading Certificate)...`
    );

    try {
      const ipfsRes = certIpfsHashInput.trim()
        ? { ipfsHash: certIpfsHashInput.trim() }
        : await uploadMetadataToIpfs(
            pdfFile,
            {
              documentType: 'Official Organic & GI Certificate PDF',
              fileName: pdfFileName,
              tokenId: selectedProduct.tokenId,
              productName: selectedProduct.productName,
              certStandard,
              certifierOrganization: certifierOrg,
              inspectorNote,
              issuedAt: nowStr,
            },
            backendApiUrl
          );
      setCertIpfsHashInput(ipfsRes.ipfsHash);

      toast.loading(
        `2/2 ກຳລັງບັນທຶກການຢັ້ງຢືນລົງ LAB Chain (Certifying Product #${selectedProduct.tokenId})...`,
        { id: toastId }
      );

      const txRes = await callCertifyProductOnChain({
        tokenId: selectedProduct.tokenId,
        certIpfsHash: ipfsRes.ipfsHash,
        mode: architectureMode,
        contractAddress,
        backendApiUrl,
      });

      const certRecord: CertificationRecord = {
        isCertified: true,
        certIpfsHash: ipfsRes.ipfsHash,
        certPdfUrl: resolveIpfsUrl(ipfsRes.ipfsHash),
        certStandard,
        certifierOrganization: certifierOrg,
        certifierAddress: txRes.signerAddress,
        certifiedAt: nowStr,
        txHash: txRes.txHash,
        inspectorNote,
      };

      onProductCertified(selectedProduct.tokenId, certRecord);

      toast.success(
        `ຢັ້ງຢືນມາດຕະຖານສິນຄ້າ #${selectedProduct.tokenId} ລົງ Blockchain ສຳເລັດ!`,
        { id: toastId, duration: 5000 }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ການຢັ້ງຢືນບໍ່ສຳເລັດ', {
        id: toastId,
      });
    } finally {
      setIsCertifying(false);
    }
  };

  return (
    <section aria-labelledby="certifier-heading" className="space-y-6">
      {/* Clean Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-emerald-950 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-200 border border-amber-400/30 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              2. ໜ່ວຍງານກວດສອບມາດຕະຖານ (Certifier / Auditor Dashboard)
            </span>
            <h1 id="certifier-heading" className="text-xl sm:text-2xl font-bold">
              ອະນຸມັດໃບຢັ້ງຢືນມາດຕະຖານ Organic & GI (On-Chain Certification)
            </h1>
            <p className="text-teal-100/90 text-xs sm:text-sm mt-1">
              ກວດສອບແຫຼ່ງກຳເນີດສິນຄ້າ, ແນບໄຟລ໌ PDF ໃບຢັ້ງຢືນຂຶ້ນ IPFS ແລະ ປະທັບກາຮັບຮອງລົງ LAB Chain
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl border border-white/15 self-start">
            <div className="text-center px-3 border-e border-white/15">
              <p className="text-[11px] text-teal-200">ລໍຖ້າກວດສອບ (Pending)</p>
              <p className="text-xl font-bold text-amber-300">{pendingProducts.length}</p>
            </div>
            <div className="text-center px-3">
              <p className="text-[11px] text-teal-200">ຮັບຮອງແລ້ວ (Certified)</p>
              <p className="text-xl font-bold text-emerald-300">{certifiedProducts.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Queue */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" aria-hidden="true" />
              ສິນຄ້າທີ່ລໍຖ້າການກວດສອບ (Pending Audit: {pendingProducts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              ກົດເລືອກສິນຄ້າເພື່ອກວດສອບພິກັດ GPS ແລະ ອອກໃບຢັ້ງຢືນ
            </p>

            {pendingProducts.length === 0 ? (
              <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-1.5" aria-hidden="true" />
                <p className="text-sm font-bold text-emerald-950">
                  ກວດສອບຄົບທຸກລາຍການແລ້ວ! (All products certified)
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {pendingProducts.map((prod) => (
                  <li key={prod.tokenId}>
                    <button
                      type="button"
                      onClick={() => setSelectedTokenId(prod.tokenId)}
                      className={`w-full text-start p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                        selectedTokenId === prod.tokenId
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                          : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-bold">
                            #{prod.tokenId}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-950 text-[11px] font-semibold">
                            ⏳ ລໍຖ້າກວດສອບ (Pending)
                          </span>
                        </div>
                        <p className="font-bold text-sm text-slate-900 mt-1.5">
                          {prod.productName}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          ຜູ້ຜະລິດ: {prod.producerName}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          {prod.geo.locationName}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="text-sm font-bold text-slate-700 mt-6 mb-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              ສິນຄ້າທີ່ຜ່ານການຢັ້ງຢືນແລ້ວ (Certified: {certifiedProducts.length})
            </h3>
            <ul className="space-y-2">
              {certifiedProducts.map((prod) => (
                <li
                  key={prod.tokenId}
                  onClick={() => setSelectedTokenId(prod.tokenId)}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                    selectedTokenId === prod.tokenId
                      ? 'border-emerald-600 bg-emerald-50/60'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        #{prod.tokenId}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        ✓ ຮັບຮອງແລ້ວ (Certified)
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 truncate mt-1">
                      {prod.productName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenConsumerView(prod.tokenId);
                    }}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    ເບິ່ງໜ້າ QR
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Certification Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {selectedProduct && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    ກວດສອບສິນຄ້າ (Inspecting Product #{selectedProduct.tokenId})
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                    {selectedProduct.productName}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    ຜູ້ຜະລິດ (Producer): {selectedProduct.producerName}
                  </p>
                </div>
                <span
                  className={`self-start px-3 py-1.5 rounded-full text-xs font-bold ${
                    selectedProduct.certification.isCertified
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {selectedProduct.certification.isCertified
                    ? '✓ ຢັ້ງຢືນແລ້ວ (Certified)'
                    : '⏳ ລໍຖ້າອະນຸມັດ (Pending)'}
                </span>
              </div>

              {/* Sub-Tabs: 1. Full Timeline Inspection, 2. Certification Form */}
              <div className="mt-4 flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAuditViewTab('timeline')}
                  className={`flex-1 min-w-[200px] py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                    auditViewTab === 'timeline'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <Layers className="w-4 h-4" aria-hidden="true" />
                  <span>
                    1. 🔍 ຂະບວນການຜະລິດ: ຕົ້ນນ້ຳ & ກາງນ້ຳ ({selectedProduct.checkpoints.length}{' '}
                    ຂັ້ນຕອນ)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuditViewTab('form')}
                  className={`flex-1 min-w-[200px] py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                    auditViewTab === 'form'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <Award className="w-4 h-4" aria-hidden="true" />
                  <span>2. ✍️ ອອກໃບຢັ້ງຢືນມາດຕະຖານ (Issue Certificate)</span>
                </button>
              </div>

              {/* ===================================================================
                  TAB 1: FULL UPSTREAM & MIDSTREAM AUDIT EVIDENCE TIMELINE
                 =================================================================== */}
              {auditViewTab === 'timeline' && (
                <div className="mt-5 space-y-6">
                  {/* Part 1: Upstream Farm / Artisan Origin Card */}
                  <div className="p-5 rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-extrabold bg-emerald-600 text-white">
                        <Sprout className="w-3.5 h-3.5" aria-hidden="true" />
                        🌱 ຕົ້ນນ້ຳ: ຂໍ້ມູນແຫຼ່ງປູກ/ສວນ (Upstream Origin Farm)
                      </span>
                      <span className="text-xs font-mono text-emerald-900 font-bold">
                        ລັອດ #{selectedProduct.tokenId}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start pt-1">
                      <div className="sm:col-span-4">
                        <img
                          src={selectedProduct.heroImageUrl}
                          alt={selectedProduct.productName}
                          width={300}
                          height={200}
                          className="w-full h-32 object-cover rounded-xl border border-emerald-200 shadow-sm"
                        />
                        <a
                          href={resolveIpfsUrl(selectedProduct.originIpfsHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-800 hover:underline mt-1.5 truncate w-full"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                          IPFS: {selectedProduct.originIpfsHash.slice(0, 16)}...
                        </a>
                      </div>

                      <div className="sm:col-span-8 space-y-2 text-xs">
                        <div className="bg-white p-3 rounded-xl border border-emerald-200/80 space-y-1.5">
                          <p className="text-slate-600">
                            ຊື່ຊາວສວນ/ຊ່າງຕໍ່າຫູກ:{' '}
                            <strong className="text-slate-900 font-bold">
                              {selectedProduct.producerName}
                            </strong>
                          </p>
                          <p className="text-slate-600 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                            <span>{selectedProduct.geo.locationName}</span>
                          </p>
                          <p className="text-emerald-800 font-mono font-bold">
                            ພິກັດ GPS: {selectedProduct.geo.lat}, {selectedProduct.geo.lng}
                          </p>
                        </div>

                        {/* Batch Agriculture Metrics */}
                        {selectedProduct.batchData && (
                          <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-emerald-200/80 text-[11px]">
                            <div>
                              <span className="text-slate-500 block">ນ້ຳໜັກຜົນຜະລິດສົດ:</span>
                              <strong className="text-slate-900 text-xs">
                                {selectedProduct.batchData.freshWeightKg.toLocaleString()} kg
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-500 block">ໂຄວຕາບັນຈຸສູງສຸດ:</span>
                              <strong className="text-emerald-800 text-xs">
                                {selectedProduct.batchData.plannedBagsCount.toLocaleString()} ຖົງ
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-500 block">ສາຍພັນ (Variety):</span>
                              <span className="text-slate-800 font-semibold">
                                {selectedProduct.batchData.variety}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">ລະດັບຄວາມສູງ (Elevation):</span>
                              <span className="text-slate-800 font-semibold">
                                {selectedProduct.batchData.elevationMeters}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Handicraft Metrics */}
                        {selectedProduct.craftData && (
                          <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 text-[11px] space-y-1">
                            <p className="text-slate-700">
                              ຊ່າງຕໍ່າຫູກ: <strong>{selectedProduct.craftData.weaverName}</strong> (
                              {selectedProduct.craftData.villageName})
                            </p>
                            <p className="text-slate-700">
                              ເສັ້ນໄໝ & ສີຍ້ອມ:{' '}
                              <strong>
                                {selectedProduct.craftData.silkType} •{' '}
                                {selectedProduct.craftData.naturalDye}
                              </strong>
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
                          <span>Signer: {selectedProduct.producerAddress.slice(0, 8)}...</span>
                          {selectedProduct.originTxHash && (
                            <a
                              href={getExplorerTxUrl(selectedProduct.originTxHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:underline flex items-center gap-1 font-bold"
                            >
                              Tx: {selectedProduct.originTxHash.slice(0, 10)}... ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Part 2: Midstream Checkpoint Timeline */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                        <Factory className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        🏭 ກາງນ້ຳ: ຂັ້ນຕອນການແປຮູບເທິງ Blockchain (Midstream Processing Timeline)
                      </h3>
                      <span className="text-xs font-bold text-slate-500">
                        {selectedProduct.checkpoints.length} ຂັ້ນຕອນທີ່ບັນທຶກແລ້ວ
                      </span>
                    </div>

                    <ol className="relative border-s-2 border-emerald-400 ms-3 space-y-4 pt-1">
                      {selectedProduct.checkpoints.map((cp) => (
                        <li key={cp.stepNumber} className="ms-5">
                          <span className="absolute -start-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white ring-4 ring-white">
                            {cp.stepNumber}
                          </span>

                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:bg-slate-100/70 transition shadow-sm space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                  ຂັ້ນຕອນ #{cp.stepNumber}
                                </span>
                                <h4 className="text-sm font-bold text-slate-900">{cp.title}</h4>
                              </div>
                              <time className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" aria-hidden="true" />
                                {cp.timestamp}
                              </time>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">
                              {cp.description}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-1">
                              <div className="sm:col-span-4">
                                <img
                                  src={cp.imageUrl}
                                  alt={cp.title}
                                  width={240}
                                  height={150}
                                  className="w-full h-24 object-cover rounded-xl border border-slate-200"
                                />
                              </div>
                              <div className="sm:col-span-8 space-y-1.5 text-xs">
                                <p className="text-slate-700">
                                  ຜູ້ດຳເນີນການ:{' '}
                                  <strong className="text-slate-900">{cp.actorName}</strong>
                                </p>
                                <p className="text-slate-600 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{cp.geo.locationName}</span>
                                </p>
                                <p className="text-slate-500 font-mono text-[11px]">
                                  GPS: {cp.geo.lat}, {cp.geo.lng}
                                </p>
                                {cp.extraSpecs && (
                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {Object.entries(cp.extraSpecs).map(([k, v]) => (
                                      <span
                                        key={k}
                                        className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-slate-700 font-semibold"
                                      >
                                        {k}: {v}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-200/60">
                              <span>Actor: {cp.actorAddress.slice(0, 8)}...</span>
                              {cp.txHash && (
                                <a
                                  href={getExplorerTxUrl(cp.txHash)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-700 hover:underline flex items-center gap-1 font-bold"
                                >
                                  Tx: {cp.txHash.slice(0, 10)}... ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Proceed to Certification Form Action Button */}
                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-slate-600">
                      ກວດສອບຫຼັກຖານຕົ້ນນ້ຳ ແລະ ກາງນ້ຳຄົບຖ້ວນແລ້ວ ພ້ອມອອກໃບຢັ້ງຢືນມາດຕະຖານ
                    </p>
                    <button
                      type="button"
                      onClick={() => setAuditViewTab('form')}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-md"
                    >
                      <Award className="w-4 h-4" aria-hidden="true" />
                      ✍️ ໄປໜ້າອອກໃບຢັ້ງຢືນ (Proceed to Issue Certificate) ➡️
                    </button>
                  </div>
                </div>
              )}

              {/* ===================================================================
                  TAB 2: ISSUE CERTIFICATION FORM
                 =================================================================== */}
              {auditViewTab === 'form' && (
                <form onSubmit={handleCertifyOnChain} className="mt-5 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-700">
                      ກະລຸນາກວດສອບມາດຕະຖານ ແລະ ແນບໄຟລ໌ໃບຢັ້ງຢືນ PDF:
                    </span>
                    <button
                      type="button"
                      onClick={() => setAuditViewTab('timeline')}
                      className="text-xs font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                    >
                      ⬅️ ກວດສອບຂະບວນການຜະລິດຄືນ
                    </button>
                  </div>

                  <div>
                    <label htmlFor="cert-standard" className="block text-xs font-bold text-slate-700 mb-1">
                      ມາດຕະຖານທີ່ໃຫ້ການຢັ້ງຢືນ (Certification Standard) *
                    </label>
                    <select
                      id="cert-standard"
                      value={certStandard}
                      onChange={(e) => setCertStandard(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                    >
                      <option value="100% Verified Lao Organic & GI (ມາດຕະຖານກະສິກຳອິນຊີ & ຖິ່ນກຳເນີດ GI)">
                        100% Verified Lao Organic & GI (ມາດຕະຖານກະສິກຳອິນຊີ & ຖິ່ນກຳເນີດ GI)
                      </option>
                      <option value="Lao National Good Agricultural Practices (ມາດຕະຖານກະສິກຳດີທີ່ເໝາະສົມ Lao GAP)">
                        Lao National GAP & Organic (ມາດຕະຖານກະສິກຳອິນຊີແຫ່ງຊາດ)
                      </option>
                      <option value="100% Verified Lao Handwoven Silk GI (ມາດຕະຖານຜ້າໄໝທໍມື ແລະ ຍ້ອມສີທຳມະຊາດ)">
                        Lao Handwoven Silk GI (ກາໝາຍຮັບຮອງຜ້າໄໝທໍມືແຫ່ງຊາດ)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="certifier-org" className="block text-xs font-bold text-slate-700 mb-1">
                      ໜ່ວຍງານຜູ້ອອກໃບຢັ້ງຢືນ (Certifying Authority) *
                    </label>
                    <input
                      id="certifier-org"
                      type="text"
                      required
                      value={certifierOrg}
                      onChange={(e) => setCertifierOrg(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                    >
                    </input>
                  </div>

                  <div>
                    <label htmlFor="inspector-note" className="block text-xs font-bold text-slate-700 mb-1">
                      ບັນທຶກຜົນການກວດສອບຄຸນນະພາບ (Inspection Notes) *
                    </label>
                    <textarea
                      id="inspector-note"
                      rows={2}
                      required
                      value={inspectorNote}
                      onChange={(e) => setInspectorNote(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900"
                    />
                  </div>

                  {/* Upload PDF Certificate to IPFS */}
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
                          <FileText className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            ໄຟລ໌ໃບຢັ້ງຢືນ PDF / ຮູບພາບ (Certificate Document on IPFS)
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            ໄຟລ໌ປັດຈຸບັນ: <strong className="font-mono text-emerald-800">{pdfFileName}</strong>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label
                          htmlFor="cert-pdf-upload"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 cursor-pointer transition shadow-sm"
                        >
                          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                          1. ເລືອກໄຟລ໌ PDF/ຮູບ
                        </label>
                        <input
                          id="cert-pdf-upload"
                          type="file"
                          accept=".pdf,image/*"
                          onChange={handlePdfUploadChange}
                          className="sr-only"
                        />

                        <button
                          type="button"
                          disabled={isUploadingCertIpfs}
                          onClick={handlePreUploadCertToPinata}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
                        >
                          <Upload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                          {isUploadingCertIpfs
                            ? 'ກຳລັງອັບໂຫຼດ...'
                            : '2. ອັບໂຫຼດຂຶ້ນ Pinata (Get CID)'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="cert-ipfs-cid" className="block text-[11px] font-semibold text-slate-700 mb-1">
                        ລະຫັດ IPFS CID ຂອງໃບຢັ້ງຢືນ (ຈະສ້າງອັດຕະໂນມັດຖ້າປະຫວ່າງໄວ້):
                      </label>
                      <input
                        id="cert-ipfs-cid"
                        type="text"
                        autocorrect="off"
                        autocapitalize="off"
                        spellCheck={false}
                        value={certIpfsHashInput}
                        onChange={(e) => setCertIpfsHashInput(e.target.value)}
                        placeholder="QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
                        className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-mono text-emerald-950"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isCertifying}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm sm:text-base font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
                  >
                    {isCertifying ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                        ກຳລັງບັນທຶກໃບຢັ້ງຢືນລົງ LAB Chain...
                      </>
                    ) : (
                      <>
                        <Award className="w-5 h-5" aria-hidden="true" />
                        ຢືນຢັນມາດຕະຖານລົງ Blockchain (Approve & Certify On-Chain)
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* On-Chain Certificate Status Box */}
              {selectedProduct.certification.isCertified && (
                <div className="mt-5 p-4 rounded-2xl bg-slate-900 text-white border border-emerald-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <FileCheck className="w-4 h-4" aria-hidden="true" />
                      ໃບຢັ້ງຢືນຖືກບັນທຶກລົງ Blockchain ແລ້ວ (Verified On-Chain)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {selectedProduct.certification.certifiedAt}
                    </span>
                  </div>
                  <p className="text-sm font-bold">{selectedProduct.certification.certStandard}</p>
                  <p className="text-xs text-slate-300">
                    ອອກໂດຍ (Issued by): {selectedProduct.certification.certifierOrganization}
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2 text-xs">
                    <a
                      href={resolveIpfsUrl(selectedProduct.certification.certIpfsHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      ເປີດເບິ່ງໄຟລ໌ໃບຢັ້ງຢືນ (Open IPFS Certificate)
                    </a>
                    {selectedProduct.certification.txHash && (
                      <a
                        href={getExplorerTxUrl(selectedProduct.certification.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-emerald-300 font-semibold hover:bg-white/20"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        ເບິ່ງທຸລະກຳເທິງ LAB Chain Explorer
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
