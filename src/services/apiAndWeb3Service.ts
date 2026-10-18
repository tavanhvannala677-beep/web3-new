import { BrowserProvider, JsonRpcProvider, type Eip1193Provider } from 'ethers';
import { LaoTrace__factory } from '../types/contracts';
import {
  DEFAULT_BACKEND_API_URL,
  DEFAULT_CONTRACT_ADDRESS,
  getLabChainAddParams,
  labChain,
  resolveIpfsUrl,
  toHexChainId,
} from '../config/labChain';
import {
  ArchitectureMode,
  ProductCategory,
  QuotaCalculationResult,
  SubUnitPinCode,
} from '../types/traceability';

function getEthereumProvider(): Eip1193Provider | undefined {
  if (typeof window === 'undefined' || !window.ethereum) return undefined;
  return window.ethereum as unknown as Eip1193Provider;
}

/**
 * สร้าง Read-Only JsonRpcProvider ยิงตรงไปที่ LAB Chain (https://rpc.labchain.la)
 * ผู้บริโภคปลายทางสามารถอ่านข้อมูลได้ทันทีโดยไม่ต้องติดตั้ง MetaMask
 */
export function getReadOnlyProvider(): JsonRpcProvider {
  return new JsonRpcProvider(labChain.rpcUrl, labChain.chainId, {
    staticNetwork: true,
  });
}

/**
 * ดึงสถานะ Block ปัจจุบันจาก LAB Chain RPC จริง
 */
export async function fetchLabChainStatus(): Promise<{
  connected: boolean;
  blockNumber: number | null;
  chainId: number;
}> {
  try {
    const provider = getReadOnlyProvider();
    const blockNumber = await provider.getBlockNumber();
    return {
      connected: true,
      blockNumber,
      chainId: labChain.chainId,
    };
  } catch {
    return {
      connected: false,
      blockNumber: null,
      chainId: labChain.chainId,
    };
  }
}

/**
 * เชื่อมต่อกระเป๋า MetaMask และสลับ/เพิ่มเครือข่ายเป็น LAB Chain (Chain ID: 5222) อัตโนมัติ
 */
export async function connectMetaMaskToLabChain(): Promise<{
  address: string;
  chainId: number;
  balanceLab: string;
}> {
  const ethereum = getEthereumProvider();
  if (!ethereum) {
    throw new Error(
      'ບໍ່ພົບ MetaMask ໃນບຣາວເຊີ ກະລຸນາຕິດຕັ້ງ MetaMask ຫຼື ປ່ຽນເປັນໂໝດ Gasless (MetaMask not found)'
    );
  }

  const accounts = (await ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('ບໍ່ໄດ້ຮັບອະນຸຍາດໃຫ້ເຂົ້າເຖິງບັນຊີ MetaMask (Account access denied)');
  }

  const targetHex = toHexChainId(labChain.chainId);
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
  } catch (err: unknown) {
    const e = err as { code?: number; data?: { originalError?: { code?: number } } };
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code === 4902 || code === -32603) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [getLabChainAddParams(labChain)],
      });
    } else {
      throw err;
    }
  }

  const browserProvider = new BrowserProvider(ethereum);
  const signer = await browserProvider.getSigner();
  const address = await signer.getAddress();

  let balanceLab = '0.0000';
  try {
    const readProvider = getReadOnlyProvider();
    const rawBal = await readProvider.getBalance(address);
    balanceLab = (Number(rawBal) / 1e18).toFixed(4);
  } catch {
    // ignore balance fetch failure
  }

  return {
    address,
    chainId: labChain.chainId,
    balanceLab,
  };
}

/**
 * 1. ฟังก์ชันอัปโหลดไฟล์รูปภาพ/PDF และ Metadata JSON ขึ้น Pinata.cloud (IPFS)
 * รองรับ 3 ช่องทางอัตโนมัติ:
 *  (1) ยิงตรงไปที่ Pinata.cloud API (https://api.pinata.cloud/pinning/pinFileToIPFS) หากตั้งค่า Pinata JWT ไว้
 *  (2) ยิงไปที่ Backend REST API ของเพื่อน (POST /api/ipfs/upload-metadata)
 *  (3) สร้างรหัส CID (เช่น QmXoy...) จำลองอัตโนมัติหากอยู่ในโหมดทดสอบออฟไลน์
 */
export async function uploadMetadataToIpfs(
  file: File | null,
  metadataPayload: Record<string, unknown>,
  backendApiUrl: string = DEFAULT_BACKEND_API_URL
): Promise<{
  ipfsHash: string;
   gatewayUrl: string;
  simulated: boolean;
  source: 'pinata-direct' | 'backend-api' | 'simulated';
}> {
  const pinataJwt =
    (typeof window !== 'undefined' && localStorage.getItem('laotrace_pinata_jwt')?.trim()) ||
    (import.meta.env.VITE_PINATA_JWT as string | undefined)?.trim() ||
    '';

  // ช่องทางที่ 1: ยิงตรงไปหา Pinata.cloud API จาก Frontend (ถ้าใส่ Pinata JWT ไว้)
  if (pinataJwt) {
    try {
      if (file) {
        const pinataForm = new FormData();
        pinataForm.append('file', file);
        pinataForm.append(
          'pinataMetadata',
          JSON.stringify({
            name: `laotrace-${file.name || Date.now()}`,
            keyvalues: {
              app: 'LaoTraceWeb3',
              timestamp: new Date().toISOString(),
            },
          })
        );

        const fileRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pinataJwt}`,
          },
          body: pinataForm,
        });

        if (fileRes.ok) {
          const fileData = (await fileRes.json()) as { IpfsHash?: string };
          if (fileData.IpfsHash) {
            const cid = fileData.IpfsHash;
            return {
              ipfsHash: cid,
              gatewayUrl: resolveIpfsUrl(cid),
              simulated: false,
              source: 'pinata-direct',
            };
          }
        }
      } else {
        // กรณีไม่มีไฟล์แนบ อัปโหลด JSON Metadata ขึ้น Pinata (pinJSONToIPFS)
        const jsonRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pinataJwt}`,
          },
          body: JSON.stringify({
            pinataMetadata: { name: `laotrace-meta-${Date.now()}` },
            pinataContent: metadataPayload,
          }),
        });

        if (jsonRes.ok) {
          const jsonData = (await jsonRes.json()) as { IpfsHash?: string };
          if (jsonData.IpfsHash) {
            const cid = jsonData.IpfsHash;
            return {
              ipfsHash: cid,
              gatewayUrl: resolveIpfsUrl(cid),
              simulated: false,
              source: 'pinata-direct',
            };
          }
        }
      }
    } catch {
      // หากยิงตรง Pinata ไม่สำเร็จ ให้ลองยิงผ่าน Backend API ต่อ
    }
  }

  // ช่องทางที่ 2: ยิงผ่าน Backend REST API ของเพื่อน (POST /api/ipfs/upload-metadata)
  try {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    formData.append('metadata', JSON.stringify(metadataPayload));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`${backendApiUrl.replace(/\/$/, '')}/ipfs/upload-metadata`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as { ipfsHash?: string; cid?: string; IpfsHash?: string };
      const rawHash = data.ipfsHash || data.cid || data.IpfsHash || '';
      if (rawHash) {
        return {
          ipfsHash: rawHash,
          gatewayUrl: resolveIpfsUrl(rawHash),
          simulated: false,
          source: 'backend-api',
        };
      }
    }
  } catch {
    // หาก Backend ของเพื่อนยังไม่ได้รัน ให้สร้าง CID รูปแบบมาตรฐาน Pinata (Qm...) เพื่อให้ทดสอบ Smart Contract ต่อได้ทันที
  }

  // ช่องทางที่ 3: สร้างรหัส CID มาตรฐาน (เช่น QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco) สำหรับโหมดสาธิต
  const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const randomSuffix = Array.from({ length: 44 }, () =>
    base58Chars[Math.floor(Math.random() * base58Chars.length)]
  ).join('');
  const cid = `Qm${randomSuffix}`;

  return {
    ipfsHash: cid,
    gatewayUrl: resolveIpfsUrl(cid),
    simulated: true,
    source: 'simulated',
  };
}

/**
 * 2. API คำนวณโควตา Mass Balance ตามกฎใน LaoTraceWeb3.sol:
 * require(_requestedUnits <= _rawWeightKg * 2, "Requested units exceed raw harvest weight quota!")
 */
export async function generateMassBalanceQuotaCodes(params: {
  tokenId: number;
  rawWeightKg: number;
  bagWeightGrams: number;
  requestedBags: number;
  yieldRatioPercent?: number;
  backendApiUrl?: string;
}): Promise<QuotaCalculationResult> {
  const {
    tokenId,
    rawWeightKg,
    bagWeightGrams,
    requestedBags,
    yieldRatioPercent = 80,
    backendApiUrl = DEFAULT_BACKEND_API_URL,
  } = params;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${backendApiUrl.replace(/\/$/, '')}/quota/generate-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId,
        rawWeightKg,
        bagWeightGrams,
        requestedBags,
        yieldRatioPercent,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return (await response.json()) as QuotaCalculationResult;
    }
  } catch {
    // Fallback คำนวณตามกฎ On-Chain ของ LaoTraceWeb3.sol (_requestedUnits <= _rawWeightKg * 2)
  }

  const maxNetWeightKg = Number(((rawWeightKg * yieldRatioPercent) / 100).toFixed(2));
  // กฎบน Smart Contract: กาแฟสด 1 กก. บรรจุถุงขายจริงได้ไม่เกิน 2 ถุง (_rawWeightKg * 2)
  const maxAllowedBags = rawWeightKg * 2;
  const isWithinQuota = requestedBags > 0 && requestedBags <= maxAllowedBags;
  const sampleCount = Math.min(requestedBags, 6);

  const generatedUnits: SubUnitPinCode[] = Array.from({ length: sampleCount }, (_, idx) => {
    const unitNum = idx + 1;
    const unitCode = `UNIT #${unitNum} (LT-${String(tokenId).padStart(2, '0')}-${String(unitNum).padStart(3, '0')})`;
    const pinCode = String(Math.floor(100000 + Math.random() * 900000));
    return {
      unitCode,
      pinCode,
      qrVerifyUrl: `/verify/${tokenId}?unit=${unitNum}`,
      isClaimed: false,
    };
  });

  return {
    tokenId,
    rawWeightKg,
    yieldRatioPercent,
    maxNetWeightKg,
    bagWeightGrams,
    maxAllowedBags,
    requestedBags,
    isWithinQuota,
    generatedUnits,
  };
}

/**
 * 3. API ตรวจสอบรหัส PIN ขูดยืนยันของแท้รายถุง (POST /api/verify-pin)
 */
export async function verifyUnitPinViaApi(params: {
  tokenId: number;
  pinOrNfc: string;
  unitNumber?: number;
  backendApiUrl?: string;
}): Promise<{ valid: boolean; alreadyClaimed: boolean; message: string } | null> {
  const { tokenId, pinOrNfc, unitNumber = 1, backendApiUrl = DEFAULT_BACKEND_API_URL } = params;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${backendApiUrl.replace(/\/$/, '')}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId, productId: tokenId, unitNumber, pin: pinOrNfc }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return (await response.json()) as {
        valid: boolean;
        alreadyClaimed: boolean;
        message: string;
      };
    }
  } catch {
    // Fallback
  }
  return null;
}

function generateMockTxHash(): string {
  const hex = Array.from({ length: 64 }, () =>
    '0123456789abcdef'[Math.floor(Math.random() * 16)]
  ).join('');
  return `0x${hex}`;
}

/**
 * เรียกฟังก์ชันจัดการสิทธิ์บน LaoTraceWeb3.sol:
 * contract.grantRoles(_account, _isProducer, _isProcessor, _isCertifier)
 */
export async function callGrantRolesOnChain(params: {
  targetAccount: string;
  isProducer: boolean;
  isProcessor: boolean;
  isCertifier: boolean;
  contractAddress?: string;
}): Promise<{ txHash: string; onChainConfirmed: boolean }> {
  const {
    targetAccount,
    isProducer,
    isProcessor,
    isCertifier,
    contractAddress = DEFAULT_CONTRACT_ADDRESS,
  } = params;

  const ethereum = getEthereumProvider();
  if (ethereum) {
    const { address } = await connectMetaMaskToLabChain();
    const browserProvider = new BrowserProvider(ethereum);
    const signer = await browserProvider.getSigner();
    const code = await browserProvider.getCode(contractAddress);
    if (code && code !== '0x') {
      const contract = LaoTrace__factory.connect(contractAddress, signer);
      const tx = await contract.grantRoles(targetAccount, isProducer, isProcessor, isCertifier);
      const receipt = await tx.wait();
      return {
        txHash: receipt?.hash || tx.hash,
        onChainConfirmed: true,
      };
    }
    return {
      txHash: generateMockTxHash(),
      onChainConfirmed: false,
    };
  }
  return {
    txHash: generateMockTxHash(),
    onChainConfirmed: false,
  };
}

/**
 * เรียก Smart Contract ฟังก์ชันที่ 1 ของ LaoTraceWeb3.sol:
 * contract.registerProduct(_category, _name, _rootIpfsHash, _initialGPS, _rawWeightKg, _requestedUnits)
 * โดย _category: 0 = AGRICULTURE, 1 = HANDICRAFT
 */
export async function callRegisterProductOnChain(params: {
  category: ProductCategory;
  name: string;
  ipfsHash: string;
  initialGPS: string;
  rawWeightKg: number;
  requestedUnits: number;
  mode: ArchitectureMode;
  contractAddress?: string;
  backendApiUrl?: string;
}): Promise<{ txHash: string; signerAddress: string; onChainConfirmed: boolean; onChainProductId?: number }> {
  const {
    category,
    name,
    ipfsHash,
    initialGPS,
    rawWeightKg,
    requestedUnits,
    mode,
    contractAddress = DEFAULT_CONTRACT_ADDRESS,
    backendApiUrl = DEFAULT_BACKEND_API_URL,
  } = params;

  // แปลงค่าตามกฎ require ใน LaoTraceWeb3.sol
  const categoryEnum = category === 'batch' ? 0 : 1; // 0 = AGRICULTURE, 1 = HANDICRAFT
  const effectiveWeightKg = category === 'craft' ? 0 : rawWeightKg;
  const effectiveUnits = category === 'craft' ? 1 : requestedUnits;

  if (category === 'batch' && effectiveUnits > effectiveWeightKg * 2) {
    throw new Error(
      `ກົດໂຄວຕາເທິງ Smart Contract: ຈຳນວນຖົງ (${effectiveUnits}) ຕ້ອງບໍ່ເກີນ 2 ເທົ່າຂອງນ້ຳໜັກຜົນຜະລິດສົດ (${effectiveWeightKg * 2} ຖົງ)!`
    );
  }

  if (mode === 'gasless-relayer') {
    try {
      const res = await fetch(`${backendApiUrl.replace(/\/$/, '')}/products/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryEnum,
          name,
          rootIpfsHash: ipfsHash,
          initialGPS,
          rawWeightKg: effectiveWeightKg,
          requestedUnits: effectiveUnits,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          txHash?: string;
          relayerAddress?: string;
          productId?: number;
        };
        return {
          txHash: data.txHash || generateMockTxHash(),
          signerAddress: data.relayerAddress || '0xLAOTraceGaslessRelayer000000000000005222',
          onChainConfirmed: true,
          onChainProductId: data.productId,
        };
      }
    } catch {
      // Fallback
    }
    await new Promise((r) => setTimeout(r, 900));
    return {
      txHash: generateMockTxHash(),
      signerAddress: '0xLAOTraceGaslessRelayer000000000000005222',
      onChainConfirmed: false,
    };
  }

  const ethereum = getEthereumProvider();
  if (ethereum) {
    try {
      const { address } = await connectMetaMaskToLabChain();
      const browserProvider = new BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const code = await browserProvider.getCode(contractAddress);
      if (code && code !== '0x') {
        const contract = LaoTrace__factory.connect(contractAddress, signer);
        const tx = await contract.registerProduct(
          BigInt(categoryEnum),
          name,
          ipfsHash,
          initialGPS,
          BigInt(effectiveWeightKg),
          BigInt(effectiveUnits)
        );
        const receipt = await tx.wait();
        return {
          txHash: receipt?.hash || tx.hash,
          signerAddress: address,
          onChainConfirmed: true,
        };
      }
      return {
        txHash: generateMockTxHash(),
        signerAddress: address,
        onChainConfirmed: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('action_rejected')) {
        throw new Error('ທ່ານກົດຍົກເລີກການເຊັນທຸລະກຳໃນ MetaMask (Transaction Rejected)');
      }
      if (msg.includes('Not an authorized producer')) {
        throw new Error('ກະເປົານີ້ຍັງບໍ່ໄດ້ຮັບສິດ Producer (ໃຫ້ Admin ກົດອະນຸມັດສິດໃນເມນູ ຕັ້ງຄ່າ)');
      }
      if (msg.includes('Requested units exceed raw harvest weight quota')) {
        throw new Error('ຈຳນວນຖົງເກີນໂຄວຕາເທິງ Smart Contract (ຫ້າມເກີນ rawWeightKg * 2)');
      }
    }
  }

  await new Promise((r) => setTimeout(r, 800));
  return {
    txHash: generateMockTxHash(),
    signerAddress: '0x71C95911E9a5D330f4D621842EC243EE13432921',
    onChainConfirmed: false,
  };
}

/**
 * contract.addCheckpoint(_productId, _stageName, _locationGPS, _evidenceIpfsHash)
 */
export async function callAddCheckpointOnChain(params: {
  tokenId: number;
  stageName: string;
  locationGPS: string;
  ipfsHash: string;
  mode: ArchitectureMode;
  contractAddress?: string;
  backendApiUrl?: string;
}): Promise<{ txHash: string; signerAddress: string; onChainConfirmed: boolean }> {
  const {
    tokenId,
    stageName,
    locationGPS,
    ipfsHash,
    mode,
    contractAddress = DEFAULT_CONTRACT_ADDRESS,
    backendApiUrl = DEFAULT_BACKEND_API_URL,
  } = params;

  if (mode === 'gasless-relayer') {
    try {
      const res = await fetch(`${backendApiUrl.replace(/\/$/, '')}/products/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: tokenId,
          stageName,
          locationGPS,
          evidenceIpfsHash: ipfsHash,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { txHash?: string; relayerAddress?: string };
        return {
          txHash: data.txHash || generateMockTxHash(),
          signerAddress: data.relayerAddress || '0xLAOTraceGaslessRelayer000000000000005222',
          onChainConfirmed: true,
        };
      }
    } catch {
      // Fallback
    }
    await new Promise((r) => setTimeout(r, 900));
    return {
      txHash: generateMockTxHash(),
      signerAddress: '0xLAOTraceGaslessRelayer000000000000005222',
      onChainConfirmed: false,
    };
  }

  const ethereum = getEthereumProvider();
  if (ethereum) {
    try {
      const { address } = await connectMetaMaskToLabChain();
      const browserProvider = new BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const code = await browserProvider.getCode(contractAddress);
      if (code && code !== '0x') {
        const contract = LaoTrace__factory.connect(contractAddress, signer);
        const tx = await contract.addCheckpoint(
          BigInt(tokenId),
          stageName,
          locationGPS,
          ipfsHash
        );
        const receipt = await tx.wait();
        return {
          txHash: receipt?.hash || tx.hash,
          signerAddress: address,
          onChainConfirmed: true,
        };
      }
      return {
        txHash: generateMockTxHash(),
        signerAddress: address,
        onChainConfirmed: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('action_rejected')) {
        throw new Error('ທ່ານກົດຍົກເລີກການເຊັນທຸລະກຳໃນ MetaMask (Transaction Rejected)');
      }
      if (msg.includes('Caller is not an authorized producer or processor')) {
        throw new Error('ກະເປົານີ້ຍັງບໍ່ໄດ້ຮັບສິດ Processor (ໃຫ້ Admin ກົດອະນຸມັດສິດໃນເມນູ ຕັ້ງຄ່າ)');
      }
    }
  }

  await new Promise((r) => setTimeout(r, 800));
  return {
    txHash: generateMockTxHash(),
    signerAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    onChainConfirmed: false,
  };
}

/**
 * contract.certifyProduct(_productId, _certIpfsHash)
 */
export async function callCertifyProductOnChain(params: {
  tokenId: number;
  certIpfsHash: string;
  mode: ArchitectureMode;
  contractAddress?: string;
  backendApiUrl?: string;
}): Promise<{ txHash: string; signerAddress: string; onChainConfirmed: boolean }> {
  const {
    tokenId,
    certIpfsHash,
    mode,
    contractAddress = DEFAULT_CONTRACT_ADDRESS,
    backendApiUrl = DEFAULT_BACKEND_API_URL,
  } = params;

  if (mode === 'gasless-relayer') {
    try {
      const res = await fetch(`${backendApiUrl.replace(/\/$/, '')}/products/certify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: tokenId, certIpfsHash }),
      });
      if (res.ok) {
        const data = (await res.json()) as { txHash?: string; relayerAddress?: string };
        return {
          txHash: data.txHash || generateMockTxHash(),
          signerAddress: data.relayerAddress || '0xLAOTraceGaslessRelayer000000000000005222',
          onChainConfirmed: true,
        };
      }
    } catch {
      // Fallback
    }
    await new Promise((r) => setTimeout(r, 900));
    return {
      txHash: generateMockTxHash(),
      signerAddress: '0xLAOTraceGaslessRelayer000000000000005222',
      onChainConfirmed: false,
    };
  }

  const ethereum = getEthereumProvider();
  if (ethereum) {
    try {
      const { address } = await connectMetaMaskToLabChain();
      const browserProvider = new BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const code = await browserProvider.getCode(contractAddress);
      if (code && code !== '0x') {
        const contract = LaoTrace__factory.connect(contractAddress, signer);
        const tx = await contract.certifyProduct(BigInt(tokenId), certIpfsHash);
        const receipt = await tx.wait();
        return {
          txHash: receipt?.hash || tx.hash,
          signerAddress: address,
          onChainConfirmed: true,
        };
      }
      return {
        txHash: generateMockTxHash(),
        signerAddress: address,
        onChainConfirmed: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('action_rejected')) {
        throw new Error('ທ່ານກົດຍົກເລີກການເຊັນທຸລະກຳໃນ MetaMask (Transaction Rejected)');
      }
      if (msg.includes('Not an authorized certifier')) {
        throw new Error('ກະເປົານີ້ຍັງບໍ່ໄດ້ຮັບສິດ Certifier (ໃຫ້ Admin ກົດອະນຸມັດສິດໃນເມນູ ຕັ້ງຄ່າ)');
      }
    }
  }

  await new Promise((r) => setTimeout(r, 800));
  return {
    txHash: generateMockTxHash(),
    signerAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    onChainConfirmed: false,
  };
}

/**
 * เรียก Smart Contract ฟังก์ชันที่ 4 ของ LaoTraceWeb3.sol:
 * contract.claimUnit(_productId, _unitNumber)
 */
export async function callClaimUnitOnChain(params: {
  productId: number;
  unitNumber: number;
  contractAddress?: string;
}): Promise<{ txHash: string; onChainConfirmed: boolean }> {
  const { productId, unitNumber, contractAddress = DEFAULT_CONTRACT_ADDRESS } = params;
  const ethereum = getEthereumProvider();
  if (ethereum) {
    try {
      await connectMetaMaskToLabChain();
      const browserProvider = new BrowserProvider(ethereum);
      const code = await browserProvider.getCode(contractAddress);
      if (code && code !== '0x') {
        const signer = await browserProvider.getSigner();
        const contract = LaoTrace__factory.connect(contractAddress, signer);
        const tx = await contract.claimUnit(BigInt(productId), BigInt(unitNumber));
        const receipt = await tx.wait();
        return {
          txHash: receipt?.hash || tx.hash,
          onChainConfirmed: true,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes('user rejected') ||
        msg.toLowerCase().includes('action_rejected')
      ) {
        throw new Error('ທ່ານກົດຍົກເລີກການເຊັນທຸລະກຳໃນ MetaMask (Transaction Rejected)');
      }
      if (msg.includes('This unit has already been claimed')) {
        throw new Error(
          'ສິນຄ້າຊິ້ນ/ຖົງນີ້ຖືກ Claim ຢືນຢັນສິດໄປແລ້ວ! ລະວັງສິນຄ້າປອມ (Already Claimed — Counterfeit Alert!)'
        );
      }
      if (msg.includes('Invalid unit number')) {
        throw new Error('ໝາຍເລກລຳດັບຊິ້ນສິນຄ້າບໍ່ຖືກຕ້ອງ (Invalid unit number)');
      }
      if (msg.includes('Product does not exist')) {
        throw new Error('ບໍ່ພົບລະຫັດສິນຄ້ານີ້ເທິງ Blockchain (Product does not exist)');
      }
      throw err;
    }
  }
  return {
    txHash: generateMockTxHash(),
    onChainConfirmed: false,
  };
}

/**
 * ตรวจสอบสถานะการ Claim ของสินค้าชิ้นนั้นบน Smart Contract ผ่าน Read-Only Provider (ฟรี ไม่เสียค่า Gas):
 * contract.isUnitClaimed(productId, unitNumber)
 */
export async function checkUnitClaimStatus(
  productId: number,
  unitNumber: number,
  contractAddress: string = DEFAULT_CONTRACT_ADDRESS
): Promise<boolean> {
  try {
    const readProvider = getReadOnlyProvider();
    const code = await readProvider.getCode(contractAddress);
    if (!code || code === '0x') return false;
    const contract = LaoTrace__factory.connect(contractAddress, readProvider);
    return await contract.isUnitClaimed(BigInt(productId), BigInt(unitNumber));
  } catch {
    return false;
  }
}

/**
 * ดึงสิทธิ์ของกระเป๋าปัจจุบันจาก Smart Contract:
 * authorizedProducers, authorizedProcessors, authorizedCertifiers, admin
 */
export async function fetchUserRolesOnChain(
  accountAddress: string,
  contractAddress: string = DEFAULT_CONTRACT_ADDRESS
): Promise<{
  isProducer: boolean;
  isProcessor: boolean;
  isCertifier: boolean;
  isAdmin: boolean;
}> {
  try {
    const readProvider = getReadOnlyProvider();
    const code = await readProvider.getCode(contractAddress);
    if (!code || code === '0x') {
      return { isProducer: true, isProcessor: true, isCertifier: true, isAdmin: true };
    }
    const contract = LaoTrace__factory.connect(contractAddress, readProvider);
    const [isProducer, isProcessor, isCertifier, adminAddr] = await Promise.all([
      contract.authorizedProducers(accountAddress),
      contract.authorizedProcessors(accountAddress),
      contract.authorizedCertifiers(accountAddress),
      contract.admin(),
    ]);
    const isAdmin = adminAddr.toLowerCase() === accountAddress.toLowerCase();
    return {
      isProducer,
      isProcessor,
      isCertifier,
      isAdmin,
    };
  } catch {
    return { isProducer: true, isProcessor: true, isCertifier: true, isAdmin: true };
  }
}

/**
 * เรียก Smart Contract ฟังก์ชันที่ 5 ของ LaoTraceWeb3.sol ผ่าน Read-Only JsonRpcProvider (ฟรี ไม่เสียค่า Gas):
 * contract.getProductDetails(_productId) และ contract.getTimeline(_productId)
 */
export async function fetchOnChainTimelineReadOnly(
  tokenId: number,
  contractAddress: string = DEFAULT_CONTRACT_ADDRESS
): Promise<{
  foundOnChain: boolean;
  name?: string;
  category?: ProductCategory;
  rawWeightKg?: number;
  maxUnits?: number;
  isCertified?: boolean;
  certIpfsHash?: string;
  rootIpfsHash?: string;
  producer?: string;
  certifiedBy?: string;
  checkpoints?: Array<{
    stageName: string;
    locationGPS: string;
    evidenceIpfsHash: string;
    actor: string;
    timestamp: number;
  }>;
}> {
  try {
    const readProvider = getReadOnlyProvider();
    const code = await readProvider.getCode(contractAddress);
    if (!code || code === '0x') {
      return { foundOnChain: false };
    }
    const contract = LaoTrace__factory.connect(contractAddress, readProvider);
    const [product, timeline] = await Promise.all([
      contract.getProductDetails(BigInt(tokenId)),
      contract.getTimeline(BigInt(tokenId)),
    ]);

    if (!product || Number(product.productId) === 0) {
      return { foundOnChain: false };
    }

    return {
      foundOnChain: true,
      name: String(product.name),
      category: Number(product.category) === 0 ? 'batch' : 'craft',
      rawWeightKg: Number(product.rawWeightKg),
      maxUnits: Number(product.maxUnits),
      isCertified: Boolean(product.isCertified),
      certIpfsHash: String(product.certIpfsHash || ''),
      rootIpfsHash: String(product.rootIpfsHash || ''),
      producer: String(product.producer || ''),
      certifiedBy: String(product.certifiedBy || ''),
      checkpoints: timeline.map((cp) => ({
        stageName: String(cp.stageName),
        locationGPS: String(cp.locationGPS),
        evidenceIpfsHash: String(cp.evidenceIpfsHash),
        actor: String(cp.actor),
        timestamp: Number(cp.timestamp),
      })),
    };
  } catch {
    return { foundOnChain: false };
  }
}
