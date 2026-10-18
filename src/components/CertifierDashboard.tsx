import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  MapPin,
  RefreshCw,
  ShieldCheck,
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
    '100% Verified Lao Organic & GI (สิ่งบ่งชี้ทางภูมิศาสตร์)'
  );
  const [certifierOrg, setCertifierOrg] = useState(
    'กรมกสิกรรม (Department of Agriculture - DOA) & Lao GI Board'
  );
  const [inspectorNote, setInspectorNote] = useState(
    'ผ่านการตรวจวิเคราะห์ดิน แหล่งน้ำ ปราศจากสารเคมีตกค้าง 100% และอยู่ในเขตพิกัด GI จริง'
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('Lao_Organic_GI_Certificate_2026.pdf');
  const [certIpfsHashInput, setCertIpfsHashInput] = useState<string>('');
  const [isUploadingCertIpfs, setIsUploadingCertIpfs] = useState<boolean>(false);
  const [isCertifying, setIsCertifying] = useState(false);

  const selectedProduct =
    products.find((p) => p.tokenId === selectedTokenId) || products[0];

  const handlePdfUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    setPdfFileName(file.name);
    toast.success(`แนบไฟล์ใบรับรอง PDF: ${file.name} เรียบร้อย (กดปุ่มอัปโหลดขึ้น Pinata เพื่อรับ CID ได้ทันที)`);
  };

  const handlePreUploadCertToPinata = async () => {
    if (!selectedProduct) return;
    setIsUploadingCertIpfs(true);
    const toastId = toast.loading(`กำลังอัปโหลดใบรับรอง (${pdfFileName}) ขึ้น Pinata.cloud (IPFS)...`);
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
      toast.success(`ได้รับรหัส CID (_certIpfsHash): ${res.ipfsHash}`, { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'อัปโหลด IPFS ไม่สำเร็จ', { id: toastId });
    } finally {
      setIsUploadingCertIpfs(false);
    }
  };

  // เรียก POST /api/ipfs/upload-metadata หรือ Pinata.cloud -> รับ certIpfsHash -> เรียก contract.certifyProduct(tokenId, certIpfsHash)
  const handleCertifyOnChain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setIsCertifying(true);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const toastId = toast.loading(
      `1/2 กำลังอัปโหลดไฟล์ PDF (${pdfFileName}) ขึ้น Pinata IPFS เพื่อรับ certIpfsHash...`
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
        `2/2 กำลังเรียก contract.certifyProduct(${selectedProduct.tokenId}, "${ipfsRes.ipfsHash.slice(0, 18)}...") บน LAB Chain...`,
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
        `ประทับตรารับรอง On-Chain (isCertified = true) สำหรับ Token #${selectedProduct.tokenId} สำเร็จ!`,
        { id: toastId, duration: 5000 }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'รับรองมาตรฐานไม่สำเร็จ', {
        id: toastId,
      });
    } finally {
      setIsCertifying(false);
    }
  };

  return (
    <section aria-labelledby="certifier-heading" className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-emerald-950 rounded-2xl p-6 sm:p-8 text-white shadow-lg border border-teal-800/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-200 border border-amber-400/30 mb-3">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              หน้าจอที่ 2: Certifier / Auditor Dashboard (หน่วยงานตรวจสอบและรับรอง)
            </span>
            <h1 id="certifier-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
              ระบบอนุมัติใบรับรองมาตรฐานดิจิทัล (On-Chain Organic / GI Certification)
            </h1>
            <p className="text-teal-100/90 text-sm sm:text-base mt-1.5 max-w-3xl">
              สำหรับกรมกสิกรรม (DOA) หรือผู้ตรวจมาตรฐาน Organic / GI ตรวจสอบประวัติล็อตสินค้า แนบไฟล์ PDF
              ใบรับรองขึ้น IPFS และกดประทับตรา <code>isCertified = true</code> ลงบน Smart Contract
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur px-4 py-3 rounded-xl border border-white/15 self-start">
            <div className="text-center px-3 border-e border-white/15">
              <p className="text-xs text-teal-200">รอตรวจสอบ</p>
              <p className="text-xl font-bold text-amber-300">{pendingProducts.length}</p>
            </div>
            <div className="text-center px-3">
              <p className="text-xs text-teal-200">รับรองแล้ว</p>
              <p className="text-xl font-bold text-emerald-300">{certifiedProducts.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Pending & Certified Queue */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" aria-hidden="true" />
              รายการสินค้าที่รอการตรวจสอบ ({pendingProducts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">
              คลิกเลือกล็อตสินค้าเพื่อตรวจสอบพิกัด GPS และออกใบรับรองบน LAB Chain
            </p>

            {pendingProducts.length === 0 ? (
              <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm font-bold text-emerald-950">
                  ตรวจสอบครบทุกรายการแล้ว!
                </p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  สามารถเลือกดูหรือออกใบรับรองซ้ำให้กับสินค้าด้านล่างได้
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {pendingProducts.map((prod) => (
                  <li key={prod.tokenId}>
                    <button
                      type="button"
                      onClick={() => setSelectedTokenId(prod.tokenId)}
                      className={`w-full text-start p-4 rounded-xl border transition flex items-start justify-between gap-3 ${
                        selectedTokenId === prod.tokenId
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                          : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-bold">
                            Token #{prod.tokenId}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-950 text-[11px] font-semibold">
                            Pending Audit
                          </span>
                        </div>
                        <p className="font-bold text-sm text-slate-900 mt-1.5">
                          {prod.productName}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          ผู้ผลิต: {prod.producerName}
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

            <h3 className="text-sm font-bold text-slate-700 mt-6 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              รายการที่ผ่านการรับรอง On-Chain แล้ว ({certifiedProducts.length})
            </h3>
            <ul className="space-y-2.5">
              {certifiedProducts.map((prod) => (
                <li
                  key={prod.tokenId}
                  onClick={() => setSelectedTokenId(prod.tokenId)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                    selectedTokenId === prod.tokenId
                      ? 'border-emerald-600 bg-emerald-50/60'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Token #{prod.tokenId}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        isCertified = true
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
                    ดูใบเซอร์
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: On-Chain Certification Form */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {selectedProduct && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    กำลังตรวจสอบ Token ID #{selectedProduct.tokenId}
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                    {selectedProduct.productName}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    ผู้ผลิตต้นน้ำ: {selectedProduct.producerName} • พิกัด GPS: {selectedProduct.geo.lat},{' '}
                    {selectedProduct.geo.lng}
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
                    ? '✓ รับรองมาตรฐาน On-Chain แล้ว'
                    : '⏳ รอการประทับตรารับรอง'}
                </span>
              </div>

              {/* ข้อมูลสรุปของล็อตสินค้าเพื่อให้ผู้ตรวจเช็กก่อนอนุมัติ */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">แหล่งกำเนิด (Geo-Tag):</span>
                  <strong className="text-slate-900">{selectedProduct.geo.locationName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">จำนวนขั้นตอนที่บันทึก:</span>
                  <strong className="text-slate-900">{selectedProduct.checkpoints.length} Checkpoints</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Origin IPFS CID:</span>
                  <code className="text-emerald-700 font-mono break-all">
                    {selectedProduct.originIpfsHash.slice(0, 24)}...
                  </code>
                </div>
              </div>

              <form onSubmit={handleCertifyOnChain} className="mt-6 space-y-5">
                <div>
                  <label htmlFor="cert-standard" className="block text-sm font-semibold text-slate-800 mb-1">
                    ประเภทมาตรฐานที่ให้การรับรอง <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="cert-standard"
                    value={certStandard}
                    onChange={(e) => setCertStandard(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
                  >
                    <option value="100% Verified Lao Organic & GI (สิ่งบ่งชี้ทางภูมิศาสตร์)">
                      100% Verified Lao Organic & GI (สิ่งบ่งชี้ทางภูมิศาสตร์)
                    </option>
                    <option value="Lao National Good Agricultural Practices (Lao GAP & Organic)">
                      มาตรฐานเกษตรอินทรีย์แห่งชาติ (Lao Organic Standard)
                    </option>
                    <option value="100% Verified Lao Handwoven Silk GI & Natural Dye Heritage">
                      ตรารับรองผ้าไหมทอมือและสีย้อมธรรมชาติแห่งชาติ (Lao Silk Heritage GI)
                    </option>
                  </select>
                </div>

                <div>
                  <label htmlFor="certifier-org" className="block text-sm font-semibold text-slate-800 mb-1">
                    หน่วยงานผู้ออกใบรับรอง (Certifier Authority) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="certifier-org"
                    type="text"
                    required
                    value={certifierOrg}
                    onChange={(e) => setCertifierOrg(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="inspector-note" className="block text-sm font-semibold text-slate-800 mb-1">
                    บันทึกผลการตรวจสอบคุณภาพ / ห้องปฏิบัติการ <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="inspector-note"
                    rows={3}
                    required
                    value={inspectorNote}
                    onChange={(e) => setInspectorNote(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                  />
                </div>

                {/* Upload PDF Certificate to IPFS */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-600 text-white">
                        <FileText className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          แนบไฟล์ PDF / รูปใบรับรองมาตรฐานขึ้น Pinata.cloud (IPFS)
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          ไฟล์ปัจจุบัน: <strong className="font-mono text-emerald-800">{pdfFileName}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="cert-pdf-upload"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 cursor-pointer transition shrink-0 shadow-sm"
                      >
                        <Upload className="w-4 h-4" aria-hidden="true" />
                        1. เลือกไฟล์ PDF/รูปใบเซอร์
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
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        {isUploadingCertIpfs
                          ? 'กำลังอัปโหลดขึ้น Pinata...'
                          : '2. อัปโหลดขึ้น Pinata.cloud เพื่อรับ CID ทันที'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="cert-ipfs-cid" className="block text-[11px] font-bold text-slate-800 mb-1">
                      รหัส CID จาก Pinata/IPFS (<code>_certIpfsHash</code>) ที่จะส่งเข้า <code>certifyProduct()</code>:
                    </label>
                    <input
                      id="cert-ipfs-cid"
                      type="text"
                      autocorrect="off"
                      autocapitalize="off"
                      spellCheck={false}
                      value={certIpfsHashInput}
                      onChange={(e) => setCertIpfsHashInput(e.target.value)}
                      placeholder="เช่น QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco (จะสร้างให้อัตโนมัติตอนกดปุ่มด้านล่างหากเว้นว่าง)"
                      className="w-full rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-mono text-emerald-950"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCertifying}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
                >
                  {isCertifying ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                      กำลังอัปโหลด PDF ขึ้น IPFS & ประทับตรา certifyProduct() บน LAB Chain...
                    </>
                  ) : (
                    <>
                      <Award className="w-5 h-5" aria-hidden="true" />
                      Verify & Certify On-Chain (เรียกฟังก์ชัน certifyProduct)
                    </>
                  )}
                </button>
              </form>

              {/* แสดงผลใบรับรองที่อยู่บน Blockchain */}
              {selectedProduct.certification.isCertified && (
                <div className="mt-6 p-5 rounded-2xl bg-slate-900 text-white border border-emerald-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <FileCheck className="w-4 h-4" aria-hidden="true" />
                      ON-CHAIN CERTIFICATE RECORD (isCertified = true)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {selectedProduct.certification.certifiedAt}
                    </span>
                  </div>
                  <p className="text-sm font-bold">{selectedProduct.certification.certStandard}</p>
                  <p className="text-xs text-slate-300">
                    รับรองโดย: {selectedProduct.certification.certifierOrganization}
                  </p>
                  <div className="pt-2 flex flex-wrap gap-3 text-xs">
                    <a
                      href={resolveIpfsUrl(selectedProduct.certification.certIpfsHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      เปิดไฟล์ใบเซอร์จาก IPFS ({selectedProduct.certification.certIpfsHash.slice(0, 18)}...)
                    </a>
                    {selectedProduct.certification.txHash && (
                      <a
                        href={getExplorerTxUrl(selectedProduct.certification.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-emerald-300 font-semibold hover:bg-white/20"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        View on LAB Chain Explorer
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
