import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Genel "yoğunluk" (mini / detaylı) tercihi. Seçim localStorage'da tutulur; tüm
 * listeler bu ayara göre uyarlanır — kullanıcı her sayfada tekrar ayarlamak
 * zorunda kalmaz. Sayfalar isterse yerel "detaylı görünüm" düğmesiyle geçici
 * olarak override edebilir (useListDensity).
 */
const KEY = 'st_density';
type Density = 'mini' | 'detailed';

interface DensityCtx {
  mini: boolean;
  setMini: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<DensityCtx>({
  mini: false,
  setMini: () => {},
  toggle: () => {},
});

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>(() =>
    localStorage.getItem(KEY) === 'mini' ? 'mini' : 'detailed',
  );
  const setMini = (v: boolean) => {
    const d: Density = v ? 'mini' : 'detailed';
    localStorage.setItem(KEY, d);
    setDensity(d);
  };
  return (
    <Ctx.Provider
      value={{
        mini: density === 'mini',
        setMini,
        toggle: () => setMini(density !== 'mini'),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDensity() {
  return useContext(Ctx);
}

/**
 * Liste bazlı yoğunluk: varsayılan global ayardır; sayfadaki "Mini/Detaylı"
 * düğmesiyle geçici override edilebilir. Global ayar değişince override sıfırlanır
 * (global yeniden geçerli olur).
 */
export function useListDensity() {
  const { mini: globalMini } = useDensity();
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => setOverride(null), [globalMini]);
  const mini = override ?? globalMini;
  return { mini, toggle: () => setOverride(!mini) };
}

/** Liste başlığındaki küçük "Mini ⇄ Detaylı" geçiş düğmesi. */
export function DensityToggle({
  mini,
  onToggle,
}: {
  mini: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="btn bg-slate-100 px-2 py-1 text-xs"
      onClick={onToggle}
      title={mini ? 'Detaylı görünüme geç' : 'Mini görünüme geç'}
    >
      {mini ? '⊞ Detaylı' : '≡ Mini'}
    </button>
  );
}
