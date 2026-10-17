import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMe, login as loginApi, logout as logoutApi } from '../api/auth.api';
import { isOfflineError, tokenStore } from '../api/client';
import { getActiveShopId, setActiveShopId } from '../lib/shop';
import { clearUserCache } from '../offline/cache';
import { setSessionUser } from '../offline/session';
import { syncNow } from '../offline/sync';
import type { AuthUser, ShopAccess, ShopModule, UserRole } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
  /** Girebildiği dükkânlar (sistem sahibi: hepsi). */
  shops: ShopAccess[];
  /** Seçili dükkân; her istek bu dükkân adına yapılır. */
  shop: ShopAccess | null;
  setShop: (id: string) => void;
  /** Seçili dükkânda bu alanı görebilir/değiştirebilir mi? */
  can: (module: ShopModule, level?: 'read' | 'write') => boolean;
  isOwner: boolean;
  /** Seçili dükkânın yöneticisi (ya da sistem sahibi). */
  isShopAdmin: boolean;
  /** En az bir dükkânın ekibini düzenleyebilir mi? */
  managesAnyShop: boolean;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Son oturum bilgisi: sunucuya ulaşılamazken uygulama bununla açılır. */
const ME_KEY = 'st_me';

function readCachedMe(): AuthUser | null {
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedMe(me: AuthUser | null): void {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* depolama kapalı */
  }
}

/** Kayıtlı seçim hâlâ geçerliyse o, değilse ilk açık dükkân. */
function pickShop(shops: ShopAccess[]): string | null {
  const stored = getActiveShopId();
  if (stored && shops.some((s) => s.id === stored)) return stored;
  return shops.find((s) => s.isActive)?.id ?? shops[0]?.id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = useCallback((me: AuthUser) => {
    setSessionUser(me.id);
    writeCachedMe(me);
    const picked = pickShop(me.shops ?? []);
    setActiveShopId(picked);
    setShopId(picked);
    setUser(me);
    // Bu kullanıcının kuyrukta bekleyen işlemi varsa (önceki oturumdan) gönder.
    void syncNow();
  }, []);

  // Açılışta mevcut token ile oturumu geri yükle (stateless). Sunucuya
  // ulaşılamıyorsa son oturum bilgisiyle çevrimdışı açılır.
  useEffect(() => {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(adopt)
      .catch((err) => {
        // Yalnız oturum gerçekten geçersizse (401) çıkış yapılır; sunucu
        // yoksa ya da geçici bir hata verdiyse son oturum bilgisiyle açılır.
        const status = (err as { response?: { status?: number } }).response?.status;
        const cached = readCachedMe();
        if (status === 401 || (!cached && !isOfflineError(err))) {
          tokenStore.clear();
          writeCachedMe(null);
        } else if (cached) {
          adopt(cached);
        }
      })
      .finally(() => setLoading(false));
  }, [adopt]);

  const refreshMe = useCallback(async () => {
    try {
      adopt(await fetchMe());
    } catch {
      /* çevrimdışı: eldeki bilgiyle devam */
    }
  }, [adopt]);

  // İzinler sunucuda değişebilir: sekmeye dönüldüğünde (en sık dakikada bir) tazele.
  useEffect(() => {
    if (!user) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 60_000) {
        last = Date.now();
        void refreshMe();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const basic = await loginApi(email, password);
      setSessionUser(basic.id);
      try {
        adopt(await fetchMe());
      } catch {
        adopt(basic);
      }
    },
    [adopt],
  );

  const logout = useCallback(() => {
    // Ortak bilgisayarda bir sonraki kişi öncekinin listelerini görmesin.
    // Sıradaki (gönderilmemiş) işlemler silinmez: aynı kişi yeniden girince gider.
    if (user) void clearUserCache(user.id);
    setSessionUser(null);
    writeCachedMe(null);
    logoutApi();
    qc.clear();
    setUser(null);
  }, [user, qc]);

  const setShop = useCallback(
    (id: string) => {
      if (id === shopId) return;
      setActiveShopId(id);
      setShopId(id);
      // Her şey dükkâna göredir: eski dükkânın verisi ekranda kalmasın.
      void qc.resetQueries();
    },
    [shopId, qc],
  );

  const hasRole = useCallback(
    (...roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  const value = useMemo<AuthContextValue>(() => {
    const shops = user?.shops ?? [];
    const shop = shops.find((s) => s.id === shopId) ?? null;
    const isOwner = user?.role === 'owner';
    return {
      user,
      loading,
      login,
      logout,
      hasRole,
      shops,
      shop,
      setShop,
      can: (module, level = 'read') => isOwner || !!shop?.permissions?.[module]?.[level],
      isOwner,
      isShopAdmin: isOwner || !!shop?.isAdmin,
      managesAnyShop: isOwner || shops.some((s) => s.isAdmin),
      refreshMe,
    };
  }, [user, loading, login, logout, hasRole, shopId, setShop, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.');
  }
  return ctx;
}
