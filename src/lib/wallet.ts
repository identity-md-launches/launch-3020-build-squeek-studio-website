import { useEffect, useState } from "react";
import type { Address } from "viem";
export type Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<any>;
  on?: (event: string, fn: (...args: any[]) => void) => void;
  removeListener?: (event: string, fn: (...args: any[]) => void) => void;
};
export type WalletInfo = {
  uuid: string;
  name: string;
  icon?: string;
  rdns: string;
  provider: Provider;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export function useWallet() {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [active, setActive] = useState<WalletInfo | null>(null);
  const [address, setAddress] = useState<Address | undefined>();
  const [chain, setChain] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const announce = (event: Event) => {
      const { info, provider } = (event as CustomEvent).detail || {};
      if (info?.uuid && provider?.request)
        setWallets((old) =>
          old.some((w) => w.uuid === info.uuid)
            ? old
            : [...old, { ...info, provider }],
        );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    const key = localStorage.getItem("squeek-wallet");
    const found = wallets.find((w) => w.rdns === key);
    if (found && !active) {
      found.provider
        .request({ method: "eth_accounts" })
        .then((a: string[]) => {
          if (a[0]) {
            setActive(found);
            setAddress(a[0] as Address);
            found.provider
              .request({ method: "eth_chainId" })
              .then(setChain)
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [wallets, active]);
  useEffect(() => {
    if (!active) return;
    const account = (a: string[]) => {
      setAddress(a[0] as Address | undefined);
      if (!a.length) setActive(null);
    };
    const network = (c: string) => setChain(c);
    active.provider.on?.("accountsChanged", account);
    active.provider.on?.("chainChanged", network);
    return () => {
      active.provider.removeListener?.("accountsChanged", account);
      active.provider.removeListener?.("chainChanged", network);
    };
  }, [active]);
  async function connect(w: WalletInfo) {
    setPending(w.uuid);
    setError(false);
    try {
      const a = await w.provider.request({ method: "eth_requestAccounts" });
      if (!a?.[0]) throw Error();
      setAddress(a[0]);
      setActive(w);
      setChain(await w.provider.request({ method: "eth_chainId" }));
      localStorage.setItem("squeek-wallet", w.rdns);
    } catch {
      setError(true);
    } finally {
      setPending(undefined);
    }
  }
  function disconnect() {
    setActive(null);
    setAddress(undefined);
    setChain(undefined);
    localStorage.removeItem("squeek-wallet");
  }
  async function switchChain() {
    if (!active) return;
    try {
      await active.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
    } catch (e: any) {
      if (e?.code === 4902) {
        await active.provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Sepolia",
              nativeCurrency: {
                name: "Sepolia Ether",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
              blockExplorerUrls: [],
            },
          ],
        });
      } else setError(true);
    }
  }
  return {
    wallets,
    active,
    address,
    chain,
    pending,
    error,
    connect,
    disconnect,
    switchChain,
  };
}
