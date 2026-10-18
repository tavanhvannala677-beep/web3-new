import React, { useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import {
  Blocks,
  ExternalLink,
  Factory,
  QrCode,
  RotateCcw,
  Settings,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_BACKEND_API_URL,
  DEFAULT_CONTRACT_ADDRESS,
  ensureWeb3ModalInitialized,
  labChain,
} from './config/labChain';
import { INITIAL_TRACEABLE_PRODUCTS } from './data/mockProducts';
import {
  ArchitectureMode,
  CertificationRecord,
  CheckpointMetadata,
  OfflineDraftItem,
  QuotaCalculationResult,
  TraceableProduct,
} from './types/traceability';
import {
  callGrantRolesOnChain,
  connectMetaMaskToLabChain,
  fetchLabChainStatus,
} from './services/apiAndWeb3Service';
import { ProducerProcessorPortal } from './components/ProducerProcessorPortal';
import { CertifierDashboard } from './components/CertifierDashboard';
import { ConsumerVerificationPage } from './components/ConsumerVerificationPage';

type MainView = 'portal' | 'certifier' | 'consumer';

const STORAGE_KEY_PRODUCTS = 'laotrace_products_v2_lo';
const STORAGE_KEY_OFFLINE = 'laotrace_offline_drafts_v2_lo';

export default function App() {
  const getInitialRoute = (): { view: MainView; tokenId: number } => {
    const pathMatch = window.location.pathname.match(/\/verify\/(\d+)/);
    if (pathMatch) {
      return { view: 'consumer', tokenId: Number(pathMatch[1]) || 1 };
    }
    const searchParams = new URLSearchParams(window.location.search);
    const verifyParam = searchParams.get('verify');
    if (verifyParam) {
      return { view: 'consumer', tokenId: Number(verifyParam) || 1 };
    }
    return { view: 'portal', tokenId: 1 };
  };

  const initialRoute = getInitialRoute();
  const [activeView, setActiveView] = useState<MainView>(initialRoute.view);
  const [consumerTokenId, setConsumerTokenId] = useState<number>(initialRoute.tokenId);

  const [architectureMode, setArchitectureMode] = useState<ArchitectureMode>('hybrid-web3');

  const [contractAddress, setContractAddress] = useState<string>(
    () => localStorage.getItem('laotrace_contract_address') || DEFAULT_CONTRACT_ADDRESS
  );
  const [backendApiUrl, setBackendApiUrl] = useState<string>(
    () => localStorage.getItem('laotrace_backend_url') || DEFAULT_BACKEND_API_URL
  );
  const [pinataJwt, setPinataJwt] = useState<string>(
    () => localStorage.getItem('laotrace_pinata_jwt') || ''
  );

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletBalanceLab, setWalletBalanceLab] = useState<string>('0.0000');
  const [chainStatus, setChainStatus] = useState<{
    connected: boolean;
    blockNumber: number | null;
  }>({
    connected: false,
    blockNumber: null,
  });

  // Admin Role Management (grantRoles)
  const [roleTargetAccount, setRoleTargetAccount] = useState<string>('');
  const [roleIsProducer, setRoleIsProducer] = useState<boolean>(true);
  const [roleIsProcessor, setRoleIsProcessor] = useState<boolean>(true);
  const [roleIsCertifier, setRoleIsCertifier] = useState<boolean>(true);
  const [isGrantingRoles, setIsGrantingRoles] = useState<boolean>(false);

  const [products, setProducts] = useState<TraceableProduct[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      if (saved) {
        const parsed = JSON.parse(saved) as TraceableProduct[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_TRACEABLE_PRODUCTS;
  });

  const [offlineDrafts, setOfflineDrafts] = useState<OfflineDraftItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OFFLINE);
      if (saved) return JSON.parse(saved) as OfflineDraftItem[];
    } catch {
      // ignore
    }
    return [];
  });

  const settingsDialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    ensureWeb3ModalInitialized();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OFFLINE, JSON.stringify(offlineDrafts));
    } catch {
      // ignore
    }
  }, [offlineDrafts]);

  useEffect(() => {
    let mounted = true;
    const pollStatus = async () => {
      const status = await fetchLabChainStatus();
      if (mounted) {
        setChainStatus({
          connected: status.connected,
          blockNumber: status.blockNumber,
        });
      }
    };
    pollStatus();
    const timer = setInterval(pollStatus, 12000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleConnectWallet = async () => {
    const toastId = toast.loading(
      'ກຳລັງເຊື່ອມຕໍ່ MetaMask ກັບ LAB Chain (Connecting to LAB Chain 5222)...'
    );
    try {
      const res = await connectMetaMaskToLabChain();
      setWalletAddress(res.address);
      setWalletBalanceLab(res.balanceLab);
      toast.success(
        `ເຊື່ອມຕໍ່ສຳເລັດ! Connected: ${res.address.slice(0, 6)}...${res.address.slice(-4)}`,
        { id: toastId }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wallet Connection Failed', {
        id: toastId,
      });
    }
  };

  const handleOpenConsumerView = (tokenId: number) => {
    setConsumerTokenId(tokenId);
    setActiveView('consumer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProductRegistered = (newProduct: TraceableProduct) => {
    setProducts((prev) => [newProduct, ...prev]);
  };

  const handleCheckpointAdded = (tokenId: number, checkpoint: CheckpointMetadata) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.tokenId === tokenId
          ? { ...p, checkpoints: [...p.checkpoints, checkpoint] }
          : p
      )
    );
  };

  const handleQuotaUpdated = (tokenId: number, quota: QuotaCalculationResult) => {
    setProducts((prev) =>
      prev.map((p) => (p.tokenId === tokenId ? { ...p, quota } : p))
    );
  };

  const handleProductCertified = (tokenId: number, certRecord: CertificationRecord) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.tokenId !== tokenId) return p;
        const certCheckpoint: CheckpointMetadata = {
          stepNumber: p.checkpoints.length + 1,
          stageType: 'qc',
          title: `${p.checkpoints.length + 1}. ຢືນຢັນມາດຕະຖານ ອິນຊີ & GI (Official Organic / GI Certified)`,
          actorName: certRecord.certifierOrganization,
          actorRole: 'Certifier (ຜູ້ກວດສອບມາດຕະຖານ)',
          actorAddress: certRecord.certifierAddress,
          timestamp: certRecord.certifiedAt,
          geo: {
            lat: 17.9757,
            lng: 102.6331,
            locationName: 'Ministry of Agriculture / GI Office',
            capturedAt: certRecord.certifiedAt,
          },
          description: `ຜ່ານການຮັບຮອງມາດຕະຖານ ${certRecord.certStandard} ເທິງ LAB Chain (IPFS CID: ${certRecord.certIpfsHash})`,
          imageUrl: p.heroImageUrl,
          ipfsHash: certRecord.certIpfsHash,
          txHash: certRecord.txHash,
          extraSpecs: {
            Standard: certRecord.certStandard,
            Status: '100% Verified Lao Organic / GI',
          },
        };
        return {
          ...p,
          certification: certRecord,
          checkpoints: [...p.checkpoints, certCheckpoint],
        };
      })
    );
  };

  const handleClaimUnitPin = (tokenId: number, pinCode: string) => {
    const target = products.find((p) => p.tokenId === tokenId);
    if (!target || !target.quota) {
      return { valid: false, alreadyClaimed: false };
    }
    const unit = target.quota.generatedUnits.find((u) => u.pinCode === pinCode);
    if (!unit) {
      return { valid: false, alreadyClaimed: false };
    }
    if (unit.isClaimed) {
      return {
        valid: true,
        alreadyClaimed: true,
        unitCode: unit.unitCode,
        claimedAt: unit.claimedAt || 'Previously Claimed',
      };
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.tokenId !== tokenId || !p.quota) return p;
        return {
          ...p,
          quota: {
            ...p.quota,
            generatedUnits: p.quota.generatedUnits.map((u) =>
              u.pinCode === pinCode
                ? { ...u, isClaimed: true, claimedAt: nowStr }
                : u
            ),
          },
        };
      })
    );

    return {
      valid: true,
      alreadyClaimed: false,
      unitCode: unit.unitCode,
      claimedAt: nowStr,
    };
  };

  const handleResetDemoData = () => {
    setProducts(INITIAL_TRACEABLE_PRODUCTS);
    setOfflineDrafts([]);
    localStorage.removeItem(STORAGE_KEY_PRODUCTS);
    localStorage.removeItem(STORAGE_KEY_OFFLINE);
    toast.success('ຣີເຊັດຂໍ້ມູນຕົວຢ່າງສຳເລັດ! (Demo Data Reset Complete)');
  };

  const pendingCertCount = products.filter((p) => !p.certification.isCertified).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      {/* Clean, Easy-to-Understand Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-3 gap-3">
            {/* Brand Logo */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white font-black text-lg shadow-sm">
                  LT
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xl tracking-tight text-slate-900">
                      LaoTrace
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                      {labChain.name} ({labChain.chainId})
                      {chainStatus.blockNumber ? ` • #${chainStatus.blockNumber}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    ລະບົບກວດສອບແຫຼ່ງທີ່ມາສິນຄ້າລາວ • Web3 Supply Chain Traceability
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => settingsDialogRef.current?.showModal()}
                className="lg:hidden p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* 3 Simple Role Tabs */}
            <nav
              aria-label="Main Views"
              className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200"
            >
              <button
                type="button"
                onClick={() => setActiveView('portal')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                  activeView === 'portal'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <Factory className="w-4 h-4" aria-hidden="true" />
                <span>1. ຜູ້ຜະລິດ & ໂຮງງານ (Producer)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('certifier')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                  activeView === 'certifier'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>2. ຜູ້ກວດສອບ (Certifier)</span>
                {pendingCertCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-950">
                    {pendingCertCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveView('consumer')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                  activeView === 'consumer'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <QrCode className="w-4 h-4" aria-hidden="true" />
                <span>3. ຜູ້ບໍລິໂພກສະແກນ QR ⭐</span>
              </button>
            </nav>

            {/* Wallet & Settings */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next =
                    architectureMode === 'hybrid-web3' ? 'gasless-relayer' : 'hybrid-web3';
                  setArchitectureMode(next);
                  toast.success(
                    next === 'hybrid-web3'
                      ? 'ໂໝດ Web3 (ເຊັນຜ່ານກະເປົາ MetaMask / Sign with Wallet)'
                      : 'ໂໝດ Gasless (ບໍ່ຕ້ອງຈ່າຍຄ່າ Gas ເອງ / Relayer API)'
                  );
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  architectureMode === 'hybrid-web3'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-amber-50 text-amber-950 border-amber-300'
                }`}
              >
                {architectureMode === 'hybrid-web3' ? (
                  <>
                    <Blocks className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    Web3 Mode
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                    Gasless Mode
                  </>
                )}
              </button>

              {walletAddress ? (
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100"
                >
                  <Wallet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span className="font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-200/80 text-[10px]">
                    {walletBalanceLab} LAB
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                >
                  <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                  ເຊື່ອມຕໍ່ກະເປົາ (Connect Wallet)
                </button>
              )}

              <button
                type="button"
                onClick={() => settingsDialogRef.current?.showModal()}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                <span>ຕັ້ງຄ່າ (Settings)</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'portal' && (
          <ProducerProcessorPortal
            products={products}
            offlineDrafts={offlineDrafts}
            architectureMode={architectureMode}
            contractAddress={contractAddress}
            backendApiUrl={backendApiUrl}
            onProductRegistered={handleProductRegistered}
            onCheckpointAdded={handleCheckpointAdded}
            onQuotaUpdated={handleQuotaUpdated}
            onSaveOfflineDraft={(draft) => setOfflineDrafts((prev) => [draft, ...prev])}
            onRemoveOfflineDraft={(id) =>
              setOfflineDrafts((prev) => prev.filter((d) => d.id !== id))
            }
            onOpenConsumerView={handleOpenConsumerView}
          />
        )}

        {activeView === 'certifier' && (
          <CertifierDashboard
            products={products}
            architectureMode={architectureMode}
            contractAddress={contractAddress}
            backendApiUrl={backendApiUrl}
            onProductCertified={handleProductCertified}
            onOpenConsumerView={handleOpenConsumerView}
          />
        )}

        {activeView === 'consumer' && (
          <ConsumerVerificationPage
            products={products}
            selectedTokenId={consumerTokenId}
            contractAddress={contractAddress}
            backendApiUrl={backendApiUrl}
            onSelectTokenId={setConsumerTokenId}
            onClaimUnitPin={handleClaimUnitPin}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-800">LaoTrace Web3</span>
            <span>•</span>
            <span>
              Network: <strong>{labChain.name}</strong> (Chain ID: <code>{labChain.chainId}</code>)
            </span>
            <span>•</span>
            <a
              href={labChain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
            >
              LAB Chain Explorer <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetDemoData}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              ຣີເຊັດຂໍ້ມູນຕົວຢ່າງ (Reset Demo Data)
            </button>
          </div>
        </div>
      </footer>

      {/* Settings Dialog */}
      <dialog
        ref={settingsDialogRef}
        closedby="any"
        className="rounded-2xl p-6 max-w-xl w-full shadow-2xl border border-slate-200 bg-white text-slate-900"
      >
        <h2 className="text-lg font-bold text-slate-900">
          ⚙️ ຕັ້ງຄ່າການເຊື່ອມຕໍ່ (System & Smart Contract Settings)
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          ຕັ້ງຄ່າທີ່ຢູ່ Smart Contract <code>LaoTraceWeb3</code>, Backend API ແລະ Pinata IPFS
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="cfg-contract-addr" className="block text-xs font-bold text-slate-800 mb-1">
              1. ທີ່ຢູ່ Smart Contract (LaoTraceWeb3 Address on LAB Chain 5222)
            </label>
            <input
              id="cfg-contract-addr"
              type="text"
              autocorrect="off"
              autocapitalize="off"
              spellCheck={false}
              value={contractAddress}
              onChange={(e) => {
                setContractAddress(e.target.value);
                localStorage.setItem('laotrace_contract_address', e.target.value);
              }}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cfg-backend-url" className="block text-xs font-bold text-slate-800 mb-1">
              2. Backend REST API URL (Teammate Backend Server)
            </label>
            <input
              id="cfg-backend-url"
              type="text"
              autocorrect="off"
              autocapitalize="off"
              spellCheck={false}
              value={backendApiUrl}
              onChange={(e) => {
                setBackendApiUrl(e.target.value);
                localStorage.setItem('laotrace_backend_url', e.target.value);
              }}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cfg-pinata-jwt" className="block text-xs font-bold text-slate-800 mb-1">
              3. Pinata.cloud JWT Token (ອັບໂຫຼດຮູບຂຶ້ນ IPFS ໂດຍກົງ / Direct Pinata Upload)
            </label>
            <input
              id="cfg-pinata-jwt"
              type="password"
              autocorrect="off"
              autocapitalize="off"
              spellCheck={false}
              value={pinataJwt}
              onChange={(e) => {
                setPinataJwt(e.target.value);
                localStorage.setItem('laotrace_pinata_jwt', e.target.value);
              }}
              placeholder="Paste Pinata JWT here (optional)..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900"
            />
          </div>

          {/* Admin Role Management */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                4. Admin Role Management (grantRoles)
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                ອະນຸມັດສິດກະເປົາໃນທີມ (Authorize Wallet Roles on Contract)
              </h3>
            </div>

            <div>
              <label htmlFor="cfg-role-account" className="block text-xs font-semibold text-slate-800 mb-1">
                Wallet Address (<code>0x...</code>)
              </label>
              <input
                id="cfg-role-account"
                type="text"
                autocorrect="off"
                autocapitalize="off"
                spellCheck={false}
                value={roleTargetAccount}
                onChange={(e) => setRoleTargetAccount(e.target.value)}
                placeholder={walletAddress || '0x...'}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900"
              />
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-800">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roleIsProducer}
                  onChange={(e) => setRoleIsProducer(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                ຊາວສວນ/ຊ່າງຕໍ່າຫູກ (Producer)
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roleIsProcessor}
                  onChange={(e) => setRoleIsProcessor(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                ໂຮງແປຮູບ (Processor)
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roleIsCertifier}
                  onChange={(e) => setRoleIsCertifier(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                ຜູ້ກວດສອບມາດຕະຖານ (Certifier)
              </label>
            </div>

            <button
              type="button"
              disabled={isGrantingRoles}
              onClick={async () => {
                const target = (roleTargetAccount || walletAddress || '').trim();
                if (!target) {
                  toast.error('ກະລຸນາປ້ອນ Wallet Address (Please enter a wallet address)');
                  return;
                }
                setIsGrantingRoles(true);
                try {
                  await callGrantRolesOnChain({
                    targetAccount: target,
                    isProducer: roleIsProducer,
                    isProcessor: roleIsProcessor,
                    isCertifier: roleIsCertifier,
                    contractAddress,
                  });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to grant roles');
                } finally {
                  setIsGrantingRoles(false);
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
            >
              {isGrantingRoles
                ? 'ກຳລັງອະນຸມັດສິດ... (Granting Roles...)'
                : 'ອະນຸມັດສິດເທິງ Blockchain (Grant Roles on LAB Chain)'}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <form method="dialog">
            <button
              type="submit"
              onClick={() => toast.success('ບັນທຶກການຕັ້ງຄ່າສຳເລັດ! (Settings Saved)')}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
            >
              ບັນທຶກ & ປິດ (Save & Close)
            </button>
          </form>
        </div>
      </dialog>
    </div>
  );
}
