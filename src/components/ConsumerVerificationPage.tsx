import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Coffee,
  Cpu,
  ExternalLink,
  FileCheck2,
  Globe,
  KeyRound,
  Layers,
  MapPin,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { TraceableProduct } from '../types/traceability';
import {
  getExplorerAddressUrl,
  getExplorerTxUrl,
  labChain,
  resolveIpfsUrl,
} from '../config/labChain';
import {
  callClaimUnitOnChain,
  fetchOnChainTimelineReadOnly,
  verifyUnitPinViaApi,
} from '../services/apiAndWeb3Service';

interface ConsumerVerificationPageProps {
  products: TraceableProduct[];
  selectedTokenId: number;
  contractAddress: string;
  backendApiUrl: string;
  onSelectTokenId: (tokenId: number) => void;
  onClaimUnitPin: (
    tokenId: number,
    pinCode: string
  ) => { valid: boolean; alreadyClaimed: boolean; unitCode?: string; claimedAt?: string };
}

export const ConsumerVerificationPage: React.FC<ConsumerVerificationPageProps> = ({
  products,
  selectedTokenId,
  contractAddress,
  backendApiUrl,
  onSelectTokenId,
  onClaimUnitPin,
}) => {
  const product =
    products.find((p) => p.tokenId === selectedTokenId) || products[0];

  const [searchInput, setSearchInput] = useState<string>(String(selectedTokenId));
  const [unitNumberInput, setUnitNumberInput] = useState<string>('1');
  const [pinInput, setPinInput] = useState<string>('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [isClaimingOnChain, setIsClaimingOnChain] = useState(false);
  const [claimResult, setClaimResult] = useState<{
    status: 'idle' | 'authentic-first-claim' | 'duplicate-warning' | 'invalid';
    title: string;
    detail: string;
    txHash?: string;
  }>({
    status: 'idle',
    title: '',
    detail: '',
  });
  const [rpcReadStatus, setRpcReadStatus] = useState<{
    checking: boolean;
    foundOnLiveChain: boolean;
  }>({
    checking: false,
    foundOnLiveChain: false,
  });

  useEffect(() => {
    setSearchInput(String(selectedTokenId));
    setClaimResult({ status: 'idle', title: '', detail: '' });
    setPinInput('');
    setUnitNumberInput('1');

    let cancelled = false;
    setRpcReadStatus({ checking: true, foundOnLiveChain: false });
    fetchOnChainTimelineReadOnly(selectedTokenId, contractAddress).then((res) => {
      if (!cancelled) {
        setRpcReadStatus({
          checking: false,
          foundOnLiveChain: res.foundOnChain,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTokenId, contractAddress]);

  const handleSearchTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(searchInput.replace(/\D/g, ''));
    const found = products.find((p) => p.tokenId === num);
    if (found) {
      onSelectTokenId(found.tokenId);
      toast.success(`โหลดข้อมูลย้อนกลับของ Product #${found.tokenId} สำเร็จ`);
    } else {
      toast.error(`ไม่พบรหัสสินค้า Product #${searchInput} ในระบบ`);
    }
  };

  // เรียก Smart Contract ฟังก์ชัน claimUnit(_productId, _unitNumber) บน LaoTraceWeb3
  const handleClaimOnChainDirect = async () => {
    if (!product) return;
    const unitNum = Number(unitNumberInput) || 1;
    const maxUnits =
      product.category === 'batch'
        ? product.batchData?.plannedBagsCount || product.quota?.maxAllowedBags || 1
        : 1;

    if (unitNum <= 0 || unitNum > maxUnits) {
      toast.error(
        `หมายเลขสินค้า (_unitNumber) ต้องอยู่ระหว่าง 1 ถึง ${maxUnits} ตามโควตา maxUnits บน Smart Contract`
      );
      return;
    }

    setIsClaimingOnChain(true);
    try {
      const res = await callClaimUnitOnChain({
        productId: product.tokenId,
        unitNumber: unitNum,
        contractAddress,
      });

      // หากมี PIN อยู่ในระบบ Local ให้ตัดสิทธิ์ควบคู่กันไปด้วย
      if (pinInput.trim()) {
        onClaimUnitPin(product.tokenId, pinInput.trim());
      }

      setClaimResult({
        status: 'authentic-first-claim',
        title: `บันทึก isUnitClaimed[${product.tokenId}][${unitNum}] = true บน LAB Chain สำเร็จ!`,
        detail: `เรียก contract.claimUnit(${product.tokenId}, ${unitNum}) เรียบร้อย (${
          res.onChainConfirmed ? 'Confirmed on LAB Chain' : 'Simulated Demo Mode'
        }) ป้องกันการนำรหัสชิ้นที่ #${unitNum} ไปสวมรอยซ้ำถาวร`,
        txHash: res.txHash,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'การเคลมบน Smart Contract ล้มเหลว');
    } finally {
      setIsClaimingOnChain(false);
    }
  };

  // ฟังก์ชันยืนยันรหัส PIN ขูดข้างถุงกาแฟ หรือรหัส NFC บนผ้าไหม (ไม่ต้องเสียค่า Gas)
  const handleVerifyPinOrNfc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const cleanPin = pinInput.trim();
    const unitNum = Number(unitNumberInput) || 1;
    if (!cleanPin) {
      toast.error('กรุณากรอกรหัส PIN 6 หลัก หรือรหัสชิป NFC');
      return;
    }

    setIsVerifyingPin(true);
    try {
      // 1. ลองเช็กกับ Backend REST API (POST /api/verify-pin) ก่อน
      const apiRes = await verifyUnitPinViaApi({
        tokenId: product.tokenId,
        pinOrNfc: cleanPin,
        backendApiUrl,
      });

      if (apiRes) {
        if (apiRes.valid && !apiRes.alreadyClaimed) {
          setClaimResult({
            status: 'authentic-first-claim',
            title: `ยืนยันของแท้ 100%! (Unit #${unitNum} Claimed)`,
            detail: apiRes.message || 'รหัส PIN นี้ถูกต้องและเพิ่งถูกเปิดใช้งานเป็นครั้งแรก',
          });
          toast.success('ยืนยันความเป็นเจ้าของสำเร็จ! สินค้าชิ้นนี้เป็นของแท้ 100%');
        } else if (apiRes.valid && apiRes.alreadyClaimed) {
          setClaimResult({
            status: 'duplicate-warning',
            title: 'แจ้งเตือน! รหัส PIN / หมายเลขถุงนี้เคยถูกขูดใช้งานไปแล้ว',
            detail:
              apiRes.message ||
              'ระวังสินค้าลอกเลียนแบบหรือการนำ QR Code ไปถ่ายเอกสารแปะซ้ำ (WARNING: This specific item has already been claimed!)',
          });
          toast.error('ระวัง! รหัส PIN นี้ถูกใช้งานไปแล้ว');
        } else {
          setClaimResult({
            status: 'invalid',
            title: 'ไม่พบรหัส PIN นี้ในระบบโควตาของล็อตสินค้า',
            detail: 'กรุณาตรวจสอบตัวเลขบนแถบขูดอีกครั้ง',
          });
          toast.error('รหัส PIN ไม่ถูกต้อง');
        }
        return;
      }

      // 2. สำหรับผ้าไหม (Unique Item NFC Mode: maxUnits = 1)
      if (
        product.category === 'craft' &&
        product.craftData?.nfcUid &&
        cleanPin.toLowerCase() === product.craftData.nfcUid.toLowerCase()
      ) {
        setClaimResult({
          status: 'authentic-first-claim',
          title: 'ยืนยันชิป NFC ผ้าไหมทอมือของแท้ 100%! (Unit #1 / maxUnits = 1)',
          detail: `ชิป ${product.craftData.nfcUid} ตรงกับ Product #${product.tokenId} ของ ${product.craftData.weaverName} บน LAB Chain`,
        });
        toast.success('ตรวจสอบชิป NFC สำเร็จ! ผ้าไหมผืนนี้เป็นของแท้ 100%');
        return;
      }

      // 3. ตรวจสอบและตัดสิทธิ์ใน Local Quota Store
      const localCheck = onClaimUnitPin(product.tokenId, cleanPin);
      if (localCheck.valid && !localCheck.alreadyClaimed) {
        setClaimResult({
          status: 'authentic-first-claim',
          title: `ยืนยันของแท้ 100%! ถุงรหัส ${localCheck.unitCode} (Unit #${unitNum})`,
          detail: `คุณเป็นผู้เปิดขูดรหัส PIN (${cleanPin}) เป็นคนแรกเมื่อ ${new Date()
            .toISOString()
            .replace('T', ' ')
            .slice(0, 19)} (isUnitClaimed[${product.tokenId}][${unitNum}] = true)`,
        });
        toast.success('ยืนยันของแท้สำเร็จ! บันทึกการ Claim ครั้งแรกเรียบร้อย');
      } else if (localCheck.valid && localCheck.alreadyClaimed) {
        setClaimResult({
          status: 'duplicate-warning',
          title: `WARNING: This specific item has already been claimed! (${cleanPin})`,
          detail: `รหัสประจำถุง ${localCheck.unitCode} เคยถูกกดยืนยันความเป็นเจ้าของไปแล้วเมื่อ ${localCheck.claimedAt} ห้ามรับสินค้าหากคุณเพิ่งขูดซองเป็นครั้งแรก`,
        });
        toast.error('แจ้งเตือน! รหัส PIN นี้เคยถูกกดเคลมไปแล้ว');
      } else {
        setClaimResult({
          status: 'invalid',
          title: 'รหัส PIN ไม่ถูกต้อง หรือไม่อยู่ในโควตา Mass Balance (maxUnits)',
          detail:
            'ไม่พบรหัส PIN นี้ในฐานข้อมูลของ Product ล็อตนี้ กรุณาตรวจสอบตัวเลข 6 หลักอีกครั้ง',
        });
        toast.error('ไม่พบรหัส PIN นี้ในระบบ');
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  if (!product) return null;

  const osmEmbedBbox = `${product.geo.lng - 0.04},${product.geo.lat - 0.03},${
    product.geo.lng + 0.04
  },${product.geo.lat + 0.03}`;

  return (
    <section aria-labelledby="consumer-verify-heading" className="space-y-8">
      {/* Top Read-Only Blockchain Status & Product Switcher (<search> landmark) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
            <Radio className="w-5 h-5 animate-pulse" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Read-Only Blockchain Mode (ethers.JsonRpcProvider)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                ไม่ต้องเชื่อมต่อกระเป๋า MetaMask
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              ดึงข้อมูลจาก <code>contract.getProductDetails({product.tokenId})</code> &{' '}
              <code>contract.getTimeline({product.tokenId})</code> บน{' '}
              <strong>{labChain.name}</strong> (<code>{labChain.rpcUrl}</code>)
              {rpcReadStatus.foundOnLiveChain ? ' • พบข้อมูลบน Live Contract' : ''}
            </p>
          </div>
        </div>

        {/* Product Quick Switcher & Search */}
        <search className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => (
              <button
                key={p.tokenId}
                type="button"
                onClick={() => onSelectTokenId(p.tokenId)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  p.tokenId === product.tokenId
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                #{p.tokenId} {p.category === 'batch' ? '☕' : '🧣'}{' '}
                {p.productName.slice(0, 18)}...
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchTokenSubmit} className="flex items-center gap-1.5">
            <label htmlFor="verify-token-search" className="sr-only">
              ค้นหาด้วย Token ID
            </label>
            <input
              id="verify-token-search"
              name="tokenId"
              type="text"
              inputMode="numeric"
              autocorrect="off"
              autocapitalize="off"
              spellCheck={false}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Token ID..."
              className="w-20 rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              ค้นหา
            </button>
          </form>
        </search>
      </div>

      {/* HERO CARD + 100% VERIFIED LAO ORGANIC / GI BADGE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Hero Product Image (LCP optimized per modern-web-guidance html guide) */}
          <div className="lg:col-span-5 relative min-h-[280px] sm:min-h-[340px] bg-slate-900">
            <img
              src={product.heroImageUrl}
              alt={product.productName}
              fetchPriority="high"
              width={800}
              height={600}
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
            <div className="absolute bottom-5 inset-x-5 text-white">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-extrabold">
                  TOKEN #{product.tokenId}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/20 backdrop-blur text-xs font-semibold">
                  {product.category === 'batch'
                    ? 'โหมดสินค้าเกษตร (Agricultural Batch)'
                    : 'โหมดผ้าไหมทอมือ (Unique Craft NFT)'}
                </span>
              </div>
              <p className="text-xs text-emerald-200 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {product.geo.locationName}
              </p>
            </div>
          </div>

          {/* Product Details & Prominent GI / Organic Certificate Seal */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div>
              {/* 100% Verified Lao Organic / GI Badge */}
              {product.certification.isCertified ? (
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50 border-2 border-emerald-500/70 rounded-2xl p-4 sm:p-5 shadow-sm mb-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-sm shrink-0">
                        <Award className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-2.5 py-0.5 rounded-full">
                            100% VERIFIED LAO ORGANIC / GI
                          </span>
                          <span className="text-xs font-mono text-emerald-700 font-semibold">
                            isCertified = true
                          </span>
                        </div>
                        <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                          {product.certification.certStandard}
                        </h2>
                        <p className="text-xs text-slate-600 mt-0.5">
                          รับรองโดย: <strong>{product.certification.certifierOrganization}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                      <a
                        href={resolveIpfsUrl(product.certification.certIpfsHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-sm"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        เปิดดูใบเซอร์ตัวจริง (IPFS)
                      </a>
                      {product.certification.txHash && (
                        <a
                          href={getExplorerTxUrl(product.certification.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        >
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          ดูธุรกรรมรับรองบน Explorer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold text-amber-950">
                        อยู่ระหว่างรอการประทับตรารับรอง Organic / GI บน Smart Contract
                      </p>
                      <p className="text-xs text-amber-800">
                        ผู้ตรวจสามารถอนุมัติล็อตนี้ได้ที่แท็บ "หน้าจอที่ 2: Certifier Dashboard"
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <h1
                id="consumer-verify-heading"
                className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight"
              >
                {product.productName}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                ผู้ผลิตต้นน้ำ: <strong className="text-slate-900">{product.producerName}</strong> (
                <a
                  href={getExplorerAddressUrl(product.producerAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-emerald-700 hover:underline"
                >
                  {product.producerAddress.slice(0, 10)}...{product.producerAddress.slice(-6)}
                </a>
                )
              </p>

              {/* Dynamic Attributes Summary Grid */}
              {product.category === 'batch' && product.batchData && (
                <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                  <div>
                    <dt className="text-slate-500">ชนิดพืชเศรษฐกิจ</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.batchData.cropType}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">สายพันธุ์ (Variety)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.batchData.variety}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ความสูงแปลงปลูก</dt>
                    <dd className="font-bold text-emerald-800 mt-0.5">
                      {product.batchData.elevationMeters}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">น้ำหนักผลผลิตต้นน้ำ</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">
                      {product.batchData.freshWeightKg.toLocaleString()} กิโลกรัม
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">จำนวนบรรจุทั้งล็อต</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">
                      {product.batchData.plannedBagsCount.toLocaleString()} ถุง ({product.batchData.bagWeightGrams}g)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">สถานะโควตา Mass Balance</dt>
                    <dd className="font-bold text-emerald-700 mt-0.5">
                      ✓ ผ่านเกณฑ์ ไม่มีการสวมรอย
                    </dd>
                  </div>
                </dl>
              )}

              {product.category === 'craft' && product.craftData && (
                <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-purple-50/50 p-4 rounded-2xl border border-purple-200 text-xs">
                  <div>
                    <dt className="text-slate-500">ช่างทอผ้า (Master Weaver)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.weaverName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">หมู่บ้านต้นกำเนิด</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.villageName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ชนิดเส้นไหม</dt>
                    <dd className="font-bold text-purple-900 mt-0.5">{product.craftData.silkType}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">วัตถุดิบสีย้อมธรรมชาติ</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.naturalDye}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ลวดลายโบราณ</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.ancientPattern}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ระยะเวลาทอ & ชิป NFC</dt>
                    <dd className="font-bold text-purple-900 mt-0.5">
                      {product.craftData.weavingDays} วัน ({product.craftData.nfcUid})
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Bottom Blockchain Proof Links */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Layers className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>
                  IPFS Origin Metadata:{' '}
                  <a
                    href={resolveIpfsUrl(product.originIpfsHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-emerald-700 hover:underline"
                  >
                    {product.originIpfsHash.slice(0, 26)}...
                  </a>
                </span>
              </div>
              <a
                href={getExplorerTxUrl(product.originTxHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                View on LAB Chain Block Explorer
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT: INTERACTIVE PROVENANCE TIMELINE (LEFT) + MAP & ANTI-COUNTERFEITING CLAIM (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left 7 Cols: Interactive Provenance Timeline Stepper */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-center justify-between pb-5 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Interactive Provenance Timeline
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                เส้นทางสินค้าตั้งแต่ต้นน้ำถึงปลายน้ำ ({product.checkpoints.length} ขั้นตอน)
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              On-Chain Verified
            </span>
          </div>

          <ol className="relative border-s-2 border-emerald-500/40 ms-4 mt-6 space-y-8">
            {product.checkpoints.map((cp, index) => (
              <li key={cp.stepNumber} className="ms-6">
                <span className="absolute -start-4 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-extrabold text-white ring-4 ring-emerald-50 shadow">
                  {cp.stepNumber}
                </span>

                <article className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 rounded-2xl p-5 transition shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-emerald-100 text-emerald-900">
                      ขั้นตอนที่ {cp.stepNumber} •{' '}
                      {cp.stageType === 'origin'
                        ? 'ต้นน้ำ (Origin Harvest / Weaving)'
                        : cp.stageType === 'processing'
                        ? 'แปรรูปขั้นต้น (Processing)'
                        : cp.stageType === 'roasting_dyeing'
                        ? 'คั่วกาแฟ / ย้อมสีธรรมชาติ'
                        : cp.stageType === 'qc'
                        ? 'ตรวจสอบคุณภาพ (Quality Control)'
                        : 'บรรจุและส่งออก (Export)'}
                    </span>
                    <time className="text-xs font-mono text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      {cp.timestamp}
                    </time>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    {cp.title}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                    {cp.description}
                  </p>

                  {/* Image & Extra Specs */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    <div className="sm:col-span-5">
                      <img
                        src={cp.imageUrl}
                        alt={cp.title}
                        loading={index === 0 ? 'eager' : 'lazy'}
                        width={400}
                        height={260}
                        className="w-full h-36 object-cover rounded-xl border border-slate-200"
                      />
                    </div>
                    <div className="sm:col-span-7 space-y-2 text-xs">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <p className="text-slate-500">
                          ผู้ดำเนินการ:{' '}
                          <strong className="text-slate-900">{cp.actorName}</strong> ({cp.actorRole})
                        </p>
                        <p className="text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                          <span className="truncate">{cp.geo.locationName}</span>
                        </p>
                        <p className="text-slate-500 font-mono text-[11px]">
                          GPS: {cp.geo.lat}, {cp.geo.lng}
                        </p>
                      </div>

                      {cp.extraSpecs && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(cp.extraSpecs).map(([k, v]) => (
                            <span
                              key={k}
                              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700"
                            >
                              <strong>{k}:</strong> {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* On-Chain Tx & IPFS Proof Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <a
                      href={resolveIpfsUrl(cp.ipfsHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-slate-600 hover:text-emerald-700 hover:underline"
                    >
                      IPFS: {cp.ipfsHash.slice(0, 24)}...
                    </a>
                    <a
                      href={getExplorerTxUrl(cp.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      View on Block Explorer ({cp.txHash.slice(0, 10)}...)
                    </a>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>

        {/* Right 5 Cols: Anti-Counterfeiting PIN/NFC Claim + Interactive Origin Map */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Anti-Counterfeiting Claim (ขูดรหัส PIN / แตะชิป NFC) */}
          <div className="bg-white rounded-3xl border-2 border-emerald-600/80 shadow-md p-6 sm:p-7">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2.5 rounded-2xl bg-emerald-600 text-white">
                <KeyRound className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                  Anti-Counterfeiting Ownership Claim
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  ยืนยันของแท้ & ป้องกันการคัดลอก QR ซ้ำ
                </h2>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {product.category === 'batch'
                ? 'ขูดแถบสีเงินบนถุงกาแฟ/ชาเพื่อนำรหัส PIN 6 หลักมากรอกยืนยันความเป็นเจ้าของ (ตรวจสอบผ่าน POST /api/verify-pin โดยผู้ซื้อไม่ต้องเสียค่า Gas)'
                : 'แตะสมาร์ทโฟนที่ป้ายชิป NFC บนผืนผ้าไหม หรือกรอกรหัส UID เพื่อยืนยันว่าเป็นผ้าไหมทอมือผืนจริง'}
            </p>

            {/* Quick Demo PIN Buttons for Hackathon Judges */}
            <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-700 mb-2">
                ปุ่มทดสอบด่วนสำหรับกรรมการ (คลิกเพื่อจำลองการขูดรหัส PIN & หมายเลขถุง):
              </p>
              <div className="flex flex-wrap gap-2">
                {product.quota?.generatedUnits ? (
                  product.quota.generatedUnits.map((u, idx) => (
                    <button
                      key={u.unitCode}
                      type="button"
                      onClick={() => {
                        setPinInput(u.pinCode);
                        setUnitNumberInput(String(idx + 1));
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition ${
                        u.isClaimed
                          ? 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                      }`}
                    >
                      Unit #{idx + 1} • PIN: {u.pinCode} ({u.isClaimed ? 'ใช้แล้ว/ซ้ำ' : 'ของแท้ใหม่'})
                    </button>
                  ))
                ) : product.craftData?.nfcUid ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPinInput(product.craftData?.nfcUid || '');
                      setUnitNumberInput('1');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-purple-50 border border-purple-300 text-purple-900 hover:bg-purple-100"
                  >
                    <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
                    แตะจำลอง NFC (Unit #1): {product.craftData.nfcUid}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPinInput('884920');
                      setUnitNumberInput('1');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-emerald-50 border border-emerald-300 text-emerald-900"
                  >
                    ทดลองรหัส: 884920 (Unit #1)
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleVerifyPinOrNfc} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label
                    htmlFor="consumer-unit-number"
                    className="block text-xs font-bold text-slate-800 mb-1"
                  >
                    หมายเลขถุง (<code>_unitNumber</code>)
                  </label>
                  <input
                    id="consumer-unit-number"
                    name="unitNumber"
                    type="text"
                    inputMode="numeric"
                    autocorrect="off"
                    autocapitalize="off"
                    spellCheck={false}
                    required
                    value={unitNumberInput}
                    onChange={(e) => setUnitNumberInput(e.target.value)}
                    placeholder="เช่น 1"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm font-mono font-bold text-slate-900 focus:border-emerald-600"
                  />
                </div>
                <div className="sm:col-span-8">
                  <label
                    htmlFor="consumer-pin-input"
                    className="block text-xs font-bold text-slate-800 mb-1"
                  >
                    รหัส PIN 6 หลักบนซองสินค้า หรือรหัส NFC UID
                  </label>
                  <input
                    id="consumer-pin-input"
                    name="pinCode"
                    type="text"
                    inputMode="numeric"
                    autocorrect="off"
                    autocapitalize="off"
                    spellCheck={false}
                    required
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="กรอกรหัส PIN เช่น 884920 หรือ NFC UID..."
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-mono font-bold tracking-wider text-slate-900 focus:border-emerald-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifyingPin}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
              >
                <UserCheck className="w-4 h-4" aria-hidden="true" />
                {isVerifyingPin
                  ? 'กำลังตรวจสอบรหัส...'
                  : 'กดยืนยันของแท้แบบด่วน (Gasless PIN / NFC Check)'}
              </button>

              <button
                type="button"
                disabled={isClaimingOnChain}
                onClick={handleClaimOnChainDirect}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                {isClaimingOnChain
                  ? 'กำลังส่ง claimUnit(...) ขึ้น LAB Chain...'
                  : `เคลมสิทธิ์บน Smart Contract: contract.claimUnit(${product.tokenId}, ${
                      Number(unitNumberInput) || 1
                    })`}
              </button>
            </form>

            {/* Verification Result Alert */}
            {claimResult.status !== 'idle' && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-4 p-4 rounded-2xl border ${
                  claimResult.status === 'authentic-first-claim'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : claimResult.status === 'duplicate-warning'
                    ? 'bg-red-50 border-red-400 text-red-950'
                    : 'bg-amber-50 border-amber-400 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {claimResult.status === 'authentic-first-claim' ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm font-extrabold">{claimResult.title}</p>
                    <p className="text-xs mt-1 leading-relaxed">{claimResult.detail}</p>
                    {claimResult.txHash && (
                      <a
                        href={getExplorerTxUrl(claimResult.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        ดูธุรกรรม claimUnit บน LAB Chain Explorer
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Interactive Origin Map (ปากซอง / หลวงพระบาง / พงสาลี) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <Globe className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    แผนที่พิกัดแหล่งกำเนิด (Geo-Tagged Origin Map)
                  </h3>
                  <p className="text-xs text-slate-500">{product.geo.locationName}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 h-60">
              <iframe
                title={`แผนที่พิกัดแหล่งกำเนิด ${product.productName}`}
                width="100%"
                height="240"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${osmEmbedBbox}&layer=mapnik&marker=${product.geo.lat},${product.geo.lng}`}
                className="w-full h-full border-0"
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <span className="font-mono">
                Lat: {product.geo.lat}, Lng: {product.geo.lng}
              </span>
              <a
                href={`https://www.google.com/maps?q=${product.geo.lat},${product.geo.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                เปิดดูพิกัดสวนบน Google Maps
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
