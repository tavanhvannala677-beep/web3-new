import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  FileCheck2,
  Globe,
  KeyRound,
  Layers,
  MapPin,
  Printer,
  QrCode,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { TraceableProduct } from '../types/traceability';
import {
  getExplorerAddressUrl,
  getExplorerTxUrl,
  labChain,
  resolveIpfsUrl,
} from '../config/labChain';
import {
  callClaimUnitOnChain,
  checkUnitClaimStatus,
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

  const getInitialUnit = () => {
    if (typeof window === 'undefined') return '1';
    const pathMatch = window.location.pathname.match(/\/unit\/(\d+)/);
    if (pathMatch) return pathMatch[1];
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('unit') || '1';
  };

  const [searchInput, setSearchInput] = useState<string>(String(selectedTokenId));
  const [unitNumberInput, setUnitNumberInput] = useState<string>(getInitialUnit);
  const [isUnitClaimedOnChain, setIsUnitClaimedOnChain] = useState<boolean | null>(null);
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
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  useEffect(() => {
    setSearchInput(`LT-2026-${String(selectedTokenId).padStart(3, '0')}`);
    setClaimResult({ status: 'idle', title: '', detail: '' });
    setPinInput('');

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

    const unitNum = Number(unitNumberInput) || 1;
    checkUnitClaimStatus(selectedTokenId, unitNum, contractAddress).then((claimed) => {
      if (!cancelled) {
        setIsUnitClaimedOnChain(claimed);
        if (claimed) {
          setClaimResult({
            status: 'duplicate-warning',
            title: `⚠️ ສິນຄ້າຊິ້ນ #${unitNum} ຖືກ Claim ຢືນຢັນສິດໄປແລ້ວ! (Already Claimed — Counterfeit Alert)`,
            detail: `ລະຫັດສິນຄ້າຊິ້ນ #${unitNum} ເຄີຍຖືກກົດ Claim ຢືນຢັນສິດຄວາມເປັນເຈົ້າຂອງເທິງ Smart Contract ແລ້ວ. ຫາກທ່ານຫາກໍ່ເປີດກ່ອງໃໝ່ ອາດເປັນສິນຄ້າລອກຮຽນແບບ ຫຼື ມີການກ໊ອບປີ້ QR Code ໄປຕິດຊ້ຳ!`,
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedTokenId, unitNumberInput, contractAddress]);

  const handleSearchTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = searchInput.trim().match(/\d+/g);
    const num = parts && parts.length > 0 ? Number(parts[parts.length - 1]) : NaN;
    const found = products.find((p) => p.tokenId === num);
    if (found) {
      onSelectTokenId(found.tokenId);
      toast.success(
        `ໂຫຼດຂໍ້ມູນລະຫັດສິນຄ້າ LT-2026-${String(found.tokenId).padStart(3, '0')} ສຳເລັດ!`
      );
    } else {
      toast.error(`ບໍ່ພົບລະຫັດສິນຄ້າ "${searchInput}" ໃນລະບົບ`);
    }
  };

  // On-Chain claimUnit(productId, unitNumber)
  const handleClaimOnChainDirect = async () => {
    if (!product) return;
    const unitNum = Number(unitNumberInput) || 1;
    const maxUnits =
      product.category === 'batch'
        ? product.batchData?.plannedBagsCount || product.quota?.maxAllowedBags || 1
        : 1;

    if (unitNum <= 0 || unitNum > maxUnits) {
      toast.error(
        `ເລກຖົງ/ຊິ້ນສິນຄ້າຕ້ອງຢູ່ລະຫວ່າງ 1 ຫາ ${maxUnits} (Unit number must be 1 to ${maxUnits})`
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

      if (pinInput.trim()) {
        onClaimUnitPin(product.tokenId, pinInput.trim());
      }

      setClaimResult({
        status: 'authentic-first-claim',
        title: `ຢືນຢັນເຈົ້າຂອງສິນຄ້າຊິ້ນທີ #${unitNum} ລົງ LAB Chain ສຳເລັດ! (On-Chain Claim Confirmed)`,
        detail: `ບັນທຶກສະຖານະການເຄລມລົງ Smart Contract ຮຽບຮ້ອຍ (${
          res.onChainConfirmed ? 'Confirmed on LAB Chain' : 'Simulated Demo Mode'
        }) ເພື່ອປ້ອງກັນການນຳລະຫັດຊິ້ນທີ #${unitNum} ໄປໃຊ້ຊ້ຳຖາວອນ.`,
        txHash: res.txHash,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ການເຄລມເທິງ Blockchain ບໍ່ສຳເລັດ');
    } finally {
      setIsClaimingOnChain(false);
    }
  };

  // Instant PIN / NFC Verification (Free / No Gas)
  const handleVerifyPinOrNfc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const cleanPin = pinInput.trim();
    const unitNum = Number(unitNumberInput) || 1;
    if (!cleanPin) {
      toast.error('ກະລຸນາປ້ອນລະຫັດ PIN 6 ຕົວເລກ ຫຼື ລະຫັດຊິບ NFC');
      return;
    }

    setIsVerifyingPin(true);
    try {
      const apiRes = await verifyUnitPinViaApi({
        tokenId: product.tokenId,
        pinOrNfc: cleanPin,
        backendApiUrl,
      });

      if (apiRes) {
        if (apiRes.valid && !apiRes.alreadyClaimed) {
          setClaimResult({
            status: 'authentic-first-claim',
            title: `ຢືນຢັນຂອງແທ້ 100%! (Authentic — Unit #${unitNum} Claimed)`,
            detail:
              apiRes.message ||
              'ລະຫັດ PIN ນີ້ຖືກຕ້ອງ ແລະ ຫາກໍຖືກເປີດໃຊ້ງານເປັນຄັ້ງທຳອິດ (First-time Verification)',
          });
          toast.success('ຢືນຢັນສຳເລັດ! ສິນຄ້ານີ້ແມ່ນຂອງແທ້ 100%');
        } else if (apiRes.valid && apiRes.alreadyClaimed) {
          setClaimResult({
            status: 'duplicate-warning',
            title: 'ຄຳເຕືອນ! ລະຫັດ PIN ນີ້ເຄີຍຖືກຂູດໃຊ້ງານໄປແລ້ວ (Duplicate Claim Warning)',
            detail:
              apiRes.message ||
              'ລະວັງສິນຄ້າລອກຮຽນແບບ ຫຼື ການນຳ QR Code ໄປກ໊ອບປີ້ຕິດຊ້ຳ (WARNING: This specific item has already been claimed!)',
          });
          toast.error('ຄຳເຕືອນ! ລະຫັດ PIN ນີ້ຖືກໃຊ້ໄປແລ້ວ');
        } else {
          setClaimResult({
            status: 'invalid',
            title: 'ບໍ່ພົບລະຫັດ PIN ນີ້ໃນລະບົບໂຄວຕາ (Invalid PIN)',
            detail: 'ກະລຸນາກວດສອບຕົວເລກ 6 ຫຼັກເທິງຊອງສິນຄ້າອີກຄັ້ງ.',
          });
          toast.error('ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ');
        }
        return;
      }

      if (
        product.category === 'craft' &&
        product.craftData?.nfcUid &&
        cleanPin.toLowerCase() === product.craftData.nfcUid.toLowerCase()
      ) {
        setClaimResult({
          status: 'authentic-first-claim',
          title: 'ຢືນຢັນຊິບ NFC ຜ້າໄໝທໍມືຂອງແທ້ 100%! (Authentic Handwoven Silk)',
          detail: `ຊິບ ${product.craftData.nfcUid} ກົງກັບສິນຄ້າ #${product.tokenId} ຂອງ ${product.craftData.weaverName} ເທິງ LAB Chain`,
        });
        toast.success('ກວດສອບຊິບ NFC ສຳເລັດ! ຜ້າໄໝผืนນີ້ແມ່ນຂອງແທ້ 100%');
        return;
      }

      const localCheck = onClaimUnitPin(product.tokenId, cleanPin);
      if (localCheck.valid && !localCheck.alreadyClaimed) {
        setClaimResult({
          status: 'authentic-first-claim',
          title: `ຢືນຢັນຂອງແທ້ 100%! ຖົງລະຫັດ ${localCheck.unitCode} (Unit #${unitNum})`,
          detail: `ທ່ານເປັນຜູ້ເປີດຂູດລະຫັດ PIN (${cleanPin}) ເປັນຄົນທຳອິດເມື່ອ ${new Date()
            .toISOString()
            .replace('T', ' ')
            .slice(0, 19)} (First-Time Ownership Verified)`,
        });
        toast.success('ຢືນຢັນຂອງແທ້ສຳເລັດ! (100% Authentic)');
      } else if (localCheck.valid && localCheck.alreadyClaimed) {
        setClaimResult({
          status: 'duplicate-warning',
          title: `ຄຳເຕືອນ: ລະຫັດນີ້ເຄີຍຖືກໃຊ້ໄປແລ້ວ! (WARNING: Already Claimed — ${cleanPin})`,
          detail: `ລະຫັດປະຈຳຖົງ ${localCheck.unitCode} ເຄີຍຖືກກົດຢືນຢັນໄປແລ້ວເມື່ອ ${localCheck.claimedAt}. ກະລຸນາລະວັງສິນຄ້າປອມແປງ!`,
        });
        toast.error('ຄຳເຕືອນ! ລະຫັດ PIN ນີ້ເຄີຍຖືກໃຊ້ໄປແລ້ວ');
      } else {
        setClaimResult({
          status: 'invalid',
          title: 'ລະຫັດ PIN ບໍ່ຖືກຕ້ອງ (Invalid PIN / Not in Quota)',
          detail: 'ບໍ່ພົບລະຫັດ PIN ນີ້ໃນຖານຂໍ້ມູນຂອງສິນຄ້າລ໊ອດນີ້ ກະລຸນາກວດສອບອີກຄັ້ງ.',
        });
        toast.error('ບໍ່ພົບລະຫັດ PIN ນີ້ໃນລະບົບ');
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
    <section aria-labelledby="consumer-verify-heading" className="space-y-6">
      {/* Top Bar: Read-Only Status + Product Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
            <Radio className="w-5 h-5 animate-pulse" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-emerald-800">
                ກວດສອບຂໍ້ມູນສິນຄ້າຈາກ Blockchain ໂດຍກົງ (Read-Only Verification)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                ບໍ່ຕ້ອງຕໍ່ກະເປົາ MetaMask (No Wallet Needed)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ເຄືອຂ່າຍ <strong>{labChain.name}</strong> ({labChain.rpcUrl})
              {rpcReadStatus.foundOnLiveChain ? ' • ເຊື່ອມຕໍ່ Smart Contract ສຳເລັດ' : ''}
            </p>
          </div>
        </div>

        {/* Product Switcher & Search */}
        <search className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => {
              const codeStr = `LT-2026-${String(p.tokenId).padStart(3, '0')}`;
              return (
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
                  {p.category === 'batch' ? '☕' : '🧣'} {codeStr}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSearchTokenSubmit} className="flex items-center gap-1.5">
            <label htmlFor="verify-token-search" className="sr-only">
              ຄົ້ນຫາດ້ວຍລະຫັດສິນຄ້າ (Search Product Code)
            </label>
            <input
              id="verify-token-search"
              name="tokenId"
              type="text"
              autocorrect="off"
              autocapitalize="off"
              spellCheck={false}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ເຊັ່ນ LT-2026-001 ຫຼື 1"
              className="w-36 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold text-slate-900"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              ຄົ້ນຫາລະຫັດ
            </button>
          </form>
        </search>
      </div>

      {/* HERO PASSPORT CARD */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Product Image */}
          <div className="lg:col-span-5 relative min-h-[260px] sm:min-h-[320px] bg-slate-900">
            <img
              src={product.heroImageUrl}
              alt={product.productName}
              fetchPriority="high"
              width={800}
              height={600}
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
            
            {/* Top Right Floating QR Code Card on Image */}
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="absolute top-4 right-4 p-2 bg-white/95 hover:bg-white rounded-2xl shadow-xl border border-slate-200 backdrop-blur transition flex items-center gap-2 group text-start z-10"
              title="ກົດເພື່ອຂະຫຍາຍ ຫຼື ສະແກນ QR Code"
            >
              <div className="p-1 bg-white rounded-xl border border-slate-200 shadow-inner">
                <QRCodeSVG
                  value={typeof window !== 'undefined' ? `${window.location.origin}/?productId=${product.tokenId}&page=consumer` : ''}
                  size={50}
                  level="M"
                />
              </div>
              <div className="pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                  📷 QR Code
                </span>
                <p className="text-xs font-extrabold text-slate-900 group-hover:text-emerald-700 mt-0.5">
                  ສະແກນຜ່ານມືຖື
                </p>
              </div>
            </button>

            <div className="absolute bottom-5 inset-x-5 text-white">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-mono font-extrabold">
                  ລະຫັດສິນຄ້າ: LT-2026-{String(product.tokenId).padStart(3, '0')} (ID #{product.tokenId})
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/20 backdrop-blur text-xs font-semibold">
                  {product.category === 'batch'
                    ? '🌾 ສິນຄ້າກະສິກຳ (Agricultural Batch)'
                    : '🧣 ຫັດຖະກຳຜ້າໄໝ (Handicraft Item)'}
                </span>
              </div>
              <p className="text-xs text-emerald-200 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {product.geo.locationName}
              </p>
            </div>
          </div>

          {/* Right: Certification Seal + Product Passport Info */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-5">
            <div>
              {/* Organic / GI Certification Badge */}
              {product.certification.isCertified ? (
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-amber-50 border-2 border-emerald-500/70 rounded-2xl p-4 shadow-sm mb-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-sm shrink-0">
                        <Award className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-200/70 px-2.5 py-0.5 rounded-full">
                          ✓ ຜ່ານການຢັ້ງຢືນມາດຕະຖານ (100% VERIFIED LAO ORGANIC & GI)
                        </span>
                        <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-1">
                          {product.certification.certStandard}
                        </h2>
                        <p className="text-xs text-slate-600 mt-0.5">
                          ຮັບຮອງໂດຍ (Certified by):{' '}
                          <strong>{product.certification.certifierOrganization}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsQrModalOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
                      >
                        <QrCode className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        ສະແກນ QR Code
                      </button>
                      <a
                        href={resolveIpfsUrl(product.certification.certIpfsHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-sm"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ເປີດໃບຢັ້ງຢືນ (View Certificate)
                      </a>
                      {product.certification.txHash && (
                        <a
                          href={getExplorerTxUrl(product.certification.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        >
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          ເບິ່ງເທິງ Blockchain Explorer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-5 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-amber-950">
                      ⏳ ລໍຖ້າການອະນຸມັດໃບຢັ້ງຢືນ Organic / GI (Pending Certification)
                    </p>
                    <p className="text-xs text-amber-800">
                      ຜູ້ກວດສອບສາມາດອະນຸມັດສິນຄ້ານີ້ໄດ້ທີ່ແທັບ "2. ຜູ້ກວດສອບ (Certifier)"
                    </p>
                  </div>
                </div>
              )}

              <h1
                id="consumer-verify-heading"
                className="text-xl sm:text-2xl font-extrabold text-slate-900"
              >
                {product.productName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                ຜູ້ຜະລິດຕົ້ນນ້ຳ (Producer):{' '}
                <strong className="text-slate-900">{product.producerName}</strong> (
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

              {/* Product Specifications Grid */}
              {product.category === 'batch' && product.batchData && (
                <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                  <div>
                    <dt className="text-slate-500">ຊະນິດພືດ (Crop Type)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.batchData.cropType}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ສາຍພັນ (Variety)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.batchData.variety}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ຄວາມສູງຈາກໜ້ານ້ຳທະເລ</dt>
                    <dd className="font-bold text-emerald-800 mt-0.5">
                      {product.batchData.elevationMeters}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ນ້ຳໜັກເກັບກ່ຽວສົດ</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">
                      {product.batchData.freshWeightKg.toLocaleString()} kg
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ຈຳນວນຖົງທັງໝົດ (Total Units)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">
                      {product.batchData.plannedBagsCount.toLocaleString()} ຖົງ ({product.batchData.bagWeightGrams}g)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ການຄວບຄຸມໂຄວຕາ (Quota Check)</dt>
                    <dd className="font-bold text-emerald-700 mt-0.5">
                      ✓ ຜ່ານເກນ ປາສະຈາກການສວມຮອຍ
                    </dd>
                  </div>
                </dl>
              )}

              {product.category === 'craft' && product.craftData && (
                <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-purple-50/50 p-4 rounded-2xl border border-purple-200 text-xs">
                  <div>
                    <dt className="text-slate-500">ຊ່າງທໍຜ້າ (Master Weaver)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.weaverName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ບ້ານຕົ້ນກຳເນີດ (Village)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.villageName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ຊະນິດເສັ້ນໄໝ (Silk Type)</dt>
                    <dd className="font-bold text-purple-900 mt-0.5">{product.craftData.silkType}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ສີຍ້ອມທຳມະຊາດ (Natural Dye)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.naturalDye}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ລວດລາຍບູຮານ (Pattern)</dt>
                    <dd className="font-bold text-slate-900 mt-0.5">{product.craftData.ancientPattern}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ເວລາທໍ & ຊິບ NFC</dt>
                    <dd className="font-bold text-purple-900 mt-0.5">
                      {product.craftData.weavingDays} ມື້ ({product.craftData.nfcUid})
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Footer Proof Links */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Layers className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>
                  IPFS CID:{' '}
                  <a
                    href={resolveIpfsUrl(product.originIpfsHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-emerald-700 hover:underline"
                  >
                    {product.originIpfsHash.slice(0, 24)}...
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
                ເບິ່ງຂໍ້ມູນເທິງ LAB Chain Explorer
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT: TIMELINE (LEFT) + PIN/NFC VERIFICATION & MAP (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Provenance Timeline */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                ເສັ້ນທາງສິນຄ້າ (Provenance Timeline)
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                ປະຫວັດການຜະລິດແຕ່ຕົ້ນນ້ຳຫາປາຍນ້ຳ ({product.checkpoints.length} ຂັ້ນຕອນ)
              </h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              On-Chain Verified
            </span>
          </div>

          <ol className="relative border-s-2 border-emerald-500/40 ms-4 mt-6 space-y-6">
            {product.checkpoints.map((cp, index) => (
              <li key={cp.stepNumber} className="ms-6">
                <span className="absolute -start-4 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-extrabold text-white ring-4 ring-emerald-50 shadow">
                  {cp.stepNumber}
                </span>

                <article className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 transition shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-900">
                      ຂັ້ນຕອນທີ {cp.stepNumber} (Step {cp.stepNumber})
                    </span>
                    <time className="text-xs font-mono text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      {cp.timestamp}
                    </time>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {cp.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                    {cp.description}
                  </p>

                  {/* Image & Actor Info */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-5">
                      <img
                        src={cp.imageUrl}
                        alt={cp.title}
                        loading={index === 0 ? 'eager' : 'lazy'}
                        width={400}
                        height={260}
                        className="w-full h-32 object-cover rounded-xl border border-slate-200"
                      />
                    </div>
                    <div className="sm:col-span-7 space-y-2 text-xs">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                        <p className="text-slate-600">
                          ຜູ້ດຳເນີນການ (Operator):{' '}
                          <strong className="text-slate-900">{cp.actorName}</strong>
                        </p>
                        <p className="text-slate-600 flex items-center gap-1">
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
                              className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700"
                            >
                              <strong>{k}:</strong> {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Proof Links */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <a
                      href={resolveIpfsUrl(cp.ipfsHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-slate-600 hover:text-emerald-700 hover:underline"
                    >
                      IPFS: {cp.ipfsHash.slice(0, 20)}...
                    </a>
                    <a
                      href={getExplorerTxUrl(cp.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      Block Explorer ({cp.txHash.slice(0, 10)}...)
                    </a>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>

        {/* Right 5 Cols: Anti-Counterfeiting Claim + GPS Origin Map */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 0: Dedicated Mobile Scan QR Code Card */}
          <div className="bg-gradient-to-br from-white to-emerald-50/60 rounded-3xl border-2 border-emerald-500/60 shadow-md p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="p-3 bg-white rounded-2xl border-2 border-dashed border-emerald-500 shadow-sm shrink-0 flex flex-col items-center">
              <QRCodeSVG
                value={typeof window !== 'undefined' ? `${window.location.origin}/?productId=${product.tokenId}&page=consumer` : ''}
                size={110}
                level="M"
              />
              <span className="text-[9px] font-mono font-bold text-slate-500 mt-1">
                ID #{product.tokenId}
              </span>
            </div>
            <div className="space-y-1.5 text-center sm:text-start flex-1 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900">
                  📱 ສະແກນດ້ວຍມືຖື (Mobile Scan)
                </span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                QR Code ປະຈຳສິນຄ້າ
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ທ່ານສາມາດ <strong>ຍົກກ້ອງມືຖືຂຶ້ນມາສ່ອງ QR Code ນີ້</strong> ເພື່ອເປີດໜ້າ Passport ກວດສອບເທິງມືຖືໄດ້ທັນທີ!
              </p>
              <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  🔍 ຂະຫຍາຍໃຫຍ່ & ພິມ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? `${window.location.origin}/?productId=${product.tokenId}&page=consumer` : '';
                    navigator.clipboard.writeText(url);
                    toast.success('ຄັດລອກລິ້ງກວດສອບແລ້ວ! (Copied)');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                >
                  📋 ຄັດລອກລິ້ງ
                </button>
              </div>
            </div>
          </div>

          {/* Card 1: Anti-Counterfeiting Ownership Claim */}
          <div className="bg-white rounded-3xl border-2 border-emerald-600/80 shadow-md p-6">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2.5 rounded-2xl bg-emerald-600 text-white">
                <KeyRound className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                  ປ້ອງກັນສິນຄ້າປອມແປງ (Anti-Counterfeiting)
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  ຢືນຢັນສິນຄ້າຂອງແທ້ (Verify PIN / NFC)
                </h2>
              </div>
            </div>

            <p className="text-xs text-slate-600 mt-1">
              {product.category === 'batch'
                ? 'ຂູດແຖບລະຫັດ PIN 6 ຕົວເລກເທິງຊອງກາເຟ/ຊາ ເພື່ອກວດສອບວ່າເປັນຂອງແທ້ ແລະ ຍັງບໍ່ເຄີຍຖືກໃຊ້ຊ້ຳ'
                : 'ແຕະຊິບ NFC ເທິງຜືນຜ້າໄໝ ຫຼື ປ້ອນລະຫັດ UID ເພື່ອຢືນຢັນວ່າເປັນຜ້າໄໝທໍມືຜືນແທ້'}
            </p>

            {/* Quick Demo Buttons */}
            <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-700 mb-2">
                ປຸ່ມທົດລອງด่วน (Quick Demo Test Buttons):
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
                      ຖົງທີ #{idx + 1} • PIN: {u.pinCode} ({u.isClaimed ? 'ໃຊ້ແລ້ວ/ຊ້ຳ' : 'ຂອງແທ້ໃໝ່'})
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
                    ທົດລອງແຕະຊິບ NFC: {product.craftData.nfcUid}
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
                    ທົດລອງລະຫັດ PIN: 884920 (ຖົງທີ #1)
                  </button>
                )}
              </div>
            </div>

            {/* Live On-Chain Unit Claim Status Indicator */}
            {isUnitClaimedOnChain !== null && (
              <div
                className={`mt-4 p-3 rounded-2xl border flex items-center justify-between text-xs font-bold ${
                  isUnitClaimedOnChain
                    ? 'bg-red-50 border-red-300 text-red-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isUnitClaimedOnChain ? (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {isUnitClaimedOnChain
                      ? `⚠️ ຊິ້ນ/ຖົງ #${unitNumberInput || '1'} ຖືກ Claim ຢືນຢັນສິດແລ້ວ (Already Claimed)`
                      : `✅ ຊິ້ນ/ຖົງ #${unitNumberInput || '1'} ຍັງບໍ່ທັນຖືກ Claim (Available for Claim)`}
                  </span>
                </div>
                <span className="text-[10px] font-mono opacity-60">LaoTraceWeb3</span>
              </div>
            )}

            <form onSubmit={handleVerifyPinOrNfc} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label
                    htmlFor="consumer-unit-number"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    ເລກຖົງ (Unit #)
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
                    placeholder="1"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono font-bold text-slate-900"
                  />
                </div>
                <div className="sm:col-span-8">
                  <label
                    htmlFor="consumer-pin-input"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    ລະຫັດ PIN 6 ຕົວເລກ ຫຼື ຊິບ NFC
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
                    placeholder="884920"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono font-bold tracking-wider text-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifyingPin}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition shadow-md"
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                {isVerifyingPin
                  ? 'ກຳລັງກວດສອບລະຫັດ (Verifying)...'
                  : '1. ກວດສອບລະຫັດ PIN / NFC ທັນທີ (ຟຣີ ບໍ່ເສຍຄ່າ Gas)'}
              </button>

              <button
                type="button"
                disabled={isClaimingOnChain || isUnitClaimedOnChain === true}
                onClick={handleClaimOnChainDirect}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  isUnitClaimedOnChain === true
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-900 text-amber-300 hover:bg-slate-800 disabled:opacity-60'
                }`}
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {isClaimingOnChain
                  ? 'ກຳລັງບັນທຶກລົງ LAB Chain...'
                  : isUnitClaimedOnChain === true
                  ? `⛔ ຊິ້ນ #${unitNumberInput || '1'} ຖືກ Claim ໄປແລ້ວ (Already Claimed)`
                  : `2. ຢືນຢັນຄວາມເປັນເຈົ້າຂອງລົງ Blockchain (Claim Unit #${unitNumberInput || '1'})`}
              </button>
            </form>

            {/* Verification Result Alert */}
            {claimResult.status === 'authentic-first-claim' && (
              <div
                role="status"
                className="mt-4 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-500 text-emerald-950 space-y-1.5"
              >
                <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                  {claimResult.title}
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">{claimResult.detail}</p>
              </div>
            )}

            {claimResult.status === 'duplicate-warning' && (
              <div
                role="alert"
                className="mt-4 p-4 rounded-2xl bg-red-50 border-2 border-red-500 text-red-950 space-y-1.5"
              >
                <div className="flex items-center gap-2 font-extrabold text-sm text-red-800">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
                  {claimResult.title}
                </div>
                <p className="text-xs text-red-900 leading-relaxed">{claimResult.detail}</p>
              </div>
            )}

            {claimResult.status === 'invalid' && (
              <div
                role="alert"
                className="mt-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-1"
              >
                <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                  {claimResult.title}
                </div>
                <p className="text-xs text-amber-800">{claimResult.detail}</p>
              </div>
            )}
          </div>

          {/* Card 2: GPS Origin Map */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <Globe className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    ແຜນທີ່ພິກັດແຫຼ່ງກຳເນີດ (GPS Origin Map)
                  </h2>
                  <p className="text-xs text-slate-500">
                    {product.geo.locationName} • GPS: {product.geo.lat}, {product.geo.lng}
                  </p>
                </div>
              </div>
              <a
                href={`https://www.openstreetmap.org/?mlat=${product.geo.lat}&mlon=${product.geo.lng}#map=13/${product.geo.lat}/${product.geo.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
              >
                ແຜນທີ່ເຕັມ
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>

            <div className="h-60 w-full bg-slate-100 relative">
              <iframe
                title={`Origin Map for ${product.productName}`}
                width="100%"
                height="100%"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${osmEmbedBbox}&layer=mapnik&marker=${product.geo.lat},${product.geo.lng}`}
                className="border-0 w-full h-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Printable / Large QR Code Modal Dialog */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                LAOTRACE DIGITAL PASSPORT
              </span>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div id="printable-consumer-qr" className="p-6 border-2 border-dashed border-emerald-500 rounded-2xl bg-emerald-50/30 flex flex-col items-center space-y-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {product.productName}
              </h3>
              <p className="text-xs text-slate-600">
                ຜູ້ຜະລິດ: {product.producerName}
              </p>

              <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-200 my-2">
                <QRCodeSVG
                  value={typeof window !== 'undefined' ? `${window.location.origin}/?productId=${product.tokenId}&page=consumer` : ''}
                  size={200}
                  level="H"
                />
              </div>

              <span className="px-3 py-1 rounded-full text-xs font-mono font-black text-amber-300 bg-slate-900">
                LT-2026-{String(product.tokenId).padStart(3, '0')} (ID #{product.tokenId})
              </span>
              <p className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
                {typeof window !== 'undefined' ? `${window.location.origin}/?productId=${product.tokenId}&page=consumer` : ''}
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
                ພິມ QR Code ນີ້ (Print)
              </button>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                ປິດ
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
