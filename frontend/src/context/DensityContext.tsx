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
const GROUP_KEY = 'st_grouped';
type Density = 'mini' | 'detailed';

interface DensityCtx {
  mini: boolean;
  setMini: (v: boolean) => void;
  toggle: () => void;
  // Genel gruplama tercihi (mini mod gibi kalıcı, tüm listelere uygulanır).
  grouped: boolean;
  setGrouped: (v: boolean) => void;
  toggleGrouped: () => void;
}

const Ctx = createContext<DensityCtx>({
  mini: false,
  setMini: () => {},
  toggle: () => {},
  grouped: false,
  setGrouped: () => {},
  toggleGrouped: () => {},
});

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>(() =>
    localStorage.getItem(KEY) === 'mini' ? 'mini' : 'detailed',
  );
  const [grouped, setGroupedState] = useState<boolean>(
    () => localStorage.getItem(GROUP_KEY) === '1',
  );
  const setMini = (v: boolean) => {
    const d: Density = v ? 'mini' : 'detailed';
    localStorage.setItem(KEY, d);
    setDensity(d);
  };
  const setGrouped = (v: boolean) => {
    localStorage.setItem(GROUP_KEY, v ? '1' : '0');
    setGroupedState(v);
  };
  return (
    <Ctx.Provider
      value={{
        mini: density === 'mini',
        setMini,
        toggle: () => setMini(density !== 'mini'),
        grouped,
        setGrouped,
        toggleGrouped: () => setGrouped(!grouped),
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

/**
 * Liste bazlı gruplama: varsayılan global "grouped" ayarıdır; sayfadaki düğmeyle
 * geçici override edilebilir. Global ayar değişince override sıfırlanır.
 */
export function useListGrouping() {
  const { grouped: globalGrouped } = useDensity();
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => setOverride(null), [globalGrouped]);
  const grouped = override ?? globalGrouped;
  return { grouped, toggle: () => setOverride(!grouped) };
}

/** Liste başlığındaki "Grupla ⇄ Düz" geçiş düğmesi. */
export function GroupToggle({
  grouped,
  onToggle,
}: {
  grouped: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="btn bg-slate-100 px-2 py-1 text-xs"
      onClick={onToggle}
      title={grouped ? 'Gruplamayı kapat' : 'Grupla'}
    >
      {grouped ? '▤ Grupsuz' : '▦ Grupla'}
    </button>
  );
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
