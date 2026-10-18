import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';

export interface ChainConfig {
  chainId: number;
  name: string;
  currency: string;
  explorerUrl: string;
  rpcUrl: string;
}

/**
 * ค่าคอนฟิกหลักของเครือข่าย LAB Chain (Chain ID: 5222) ตามมาตรฐาน LAOITDEV Workshop
 */
export const labChain: ChainConfig = {
  chainId: 5222,
  name: 'LAB Chain',
  currency: 'LAB',
  explorerUrl: 'https://explorer.labchain.la',
  rpcUrl: 'https://rpc.labchain.la',
};

export const ganacheChain: ChainConfig = {
  chainId: 1337,
  name: 'Ganache (Local)',
  currency: 'ETH',
  explorerUrl: 'http://127.0.0.1:7545',
  rpcUrl: 'http://127.0.0.1:7545',
};

export const IPFS_GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs/';

export const DEFAULT_BACKEND_API_URL =
  import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8080/api';

export const DEFAULT_CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694';

let modalInitialized = false;

export function ensureWeb3ModalInitialized() {
  if (modalInitialized || typeof window === 'undefined') return;
  try {
    const metadata = {
      name: 'LaoTrace Supply Chain DApp',
      description: 'Web3 Agricultural & Handicraft Traceability on LAB Chain',
      url: window.location.origin,
      icons: ['https://explorer.labchain.la/favicon.ico'],
    };

    const ethersConfig = defaultConfig({
      metadata,
      enableEIP6963: true,
      enableInjected: true,
      enableCoinbase: false,
      rpcUrl: labChain.rpcUrl,
      defaultChainId: labChain.chainId,
    });

    createWeb3Modal({
      ethersConfig,
      chains: [labChain],
      projectId: WALLETCONNECT_PROJECT_ID,
      enableAnalytics: false,
      themeMode: 'light',
      themeVariables: {
        '--w3m-accent': '#059669',
        '--w3m-border-radius-master': '2px',
      },
    });
    modalInitialized = true;
  } catch (err) {
    console.warn('Web3Modal initialization fallback to direct MetaMask provider:', err);
  }
}

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function getLabChainAddParams(chain: ChainConfig = labChain) {
  return {
    chainId: toHexChainId(chain.chainId),
    chainName: chain.name,
    nativeCurrency: {
      name: chain.currency,
      symbol: chain.currency,
      decimals: 18,
    },
    rpcUrls: [chain.rpcUrl],
    blockExplorerUrls: [chain.explorerUrl],
  };
}

export function resolveIpfsUrl(ipfsUriOrHash: string): string {
  if (!ipfsUriOrHash) return '';
  if (ipfsUriOrHash.startsWith('http://') || ipfsUriOrHash.startsWith('https://') || ipfsUriOrHash.startsWith('data:')) {
    return ipfsUriOrHash;
  }
  const cleanCid = ipfsUriOrHash.replace(/^ipfs:\/\//, '');
  return `${IPFS_GATEWAY_URL}${cleanCid}`;
}

export function getExplorerTxUrl(txHash: string, chain: ChainConfig = labChain): string {
  return `${chain.explorerUrl.replace(/\/$/, '')}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string, chain: ChainConfig = labChain): string {
  return `${chain.explorerUrl.replace(/\/$/, '')}/address/${address}`;
}
