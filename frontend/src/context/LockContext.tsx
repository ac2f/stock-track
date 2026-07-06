import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Arayüz ekran kilidi (kolaylık amaçlı — gerçek kimlik doğrulama DEĞİL).
 * Belirlenen süre boyunca işlem yapılmazsa arayüz kilitlenir; sayısal PIN ile
 * açılır. PIN ve süre Ayarlar'dan değiştirilebilir. Ayarlar cihaz bazında
 * localStorage'da tutulur; PIN düz metin yerine basit bir hash olarak saklanır
 * (yine de gizli veri için güvenli bir mekanizma değildir).
 *
 * PIN uzunluğu (ör. 4) girildiği an Enter'a gerek kalmadan otomatik doğrulanır.
 */
const ENABLED_KEY = 'st_lock_enabled';
const HASH_KEY = 'st_lock_pin_hash';
const LEN_KEY = 'st_lock_pin_len';
const MIN_KEY = 'st_lock_minutes';
const LOCKED_KEY = 'st_locked';

/** Basit dizi hash'i (djb2) — PIN'i düz metin saklamamak için. */
function hashPin(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export interface LockConfig {
  enabled: boolean;
  pinHash: string;
  pinLen: number;
  minutes: number;
}

function readConfig(): LockConfig {
  return {
    enabled: localStorage.getItem(ENABLED_KEY) === '1',
    pinHash: localStorage.getItem(HASH_KEY) ?? '',
    pinLen: Number(localStorage.getItem(LEN_KEY)) || 0,
    minutes: Number(localStorage.getItem(MIN_KEY)) || 5,
  };
}

export interface UpdateLockInput {
  enabled?: boolean;
  minutes?: number;
  /** Ham PIN (yalnızca rakamlar). Verilirse hash + uzunluk güncellenir. */
  pin?: string;
}

interface LockCtx {
  config: LockConfig;
  updateConfig: (input: UpdateLockInput) => void;
  lock: () => void;
  /** Kilit ayarı etkin ve PIN tanımlı mı (kilitleme mümkün mü). */
  ready: boolean;
}

const Ctx = createContext<LockCtx>({
  config: { enabled: false, pinHash: '', pinLen: 0, minutes: 5 },
  updateConfig: () => {},
  lock: () => {},
  ready: false,
});

// Herhangi bir işlem "aktif" sayılır → kilit sayacı sıfırlanır.
const IDLE_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const;

export function LockProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LockConfig>(() => readConfig());
  const ready = config.enabled && !!config.pinHash && config.pinLen > 0;
  const [locked, setLocked] = useState<boolean>(
    () => readConfig().enabled && localStorage.getItem(LOCKED_KEY) === '1',
  );
  const timerRef = useRef<number | undefined>(undefined);

  const lock = useCallback(() => {
    localStorage.setItem(LOCKED_KEY, '1');
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    localStorage.removeItem(LOCKED_KEY);
    setLocked(false);
  }, []);

  const updateConfig = useCallback((input: UpdateLockInput) => {
    if (input.enabled !== undefined)
      localStorage.setItem(ENABLED_KEY, input.enabled ? '1' : '0');
    if (input.minutes !== undefined)
      localStorage.setItem(MIN_KEY, String(Math.max(1, input.minutes)));
    if (input.pin !== undefined) {
      const digits = input.pin.replace(/\D/g, '');
      if (digits) {
        localStorage.setItem(HASH_KEY, hashPin(digits));
        localStorage.setItem(LEN_KEY, String(digits.length));
      } else {
        localStorage.removeItem(HASH_KEY);
        localStorage.removeItem(LEN_KEY);
      }
    }
    setConfig(readConfig());
  }, []);

  // Hareketsizlik sayacı: yalnızca kilit hazır (etkin + PIN) ve açıkken çalışır.
  useEffect(() => {
    if (!ready || locked) return;
    const reset = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        lock,
        Math.max(1, config.minutes) * 60_000,
      );
    };
    reset();
    IDLE_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true }),
    );
    return () => {
      window.clearTimeout(timerRef.current);
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ready, locked, config.minutes, lock]);

  return (
    <Ctx.Provider value={{ config, updateConfig, lock, ready }}>
      {children}
      {locked && ready && (
        <LockOverlay
          pinHash={config.pinHash}
          pinLen={config.pinLen}
          onUnlock={unlock}
        />
      )}
    </Ctx.Provider>
  );
}

export function useLock() {
  return useContext(Ctx);
}

/** Tam ekran kilit örtüsü + sayısal tuş takımı. */
function LockOverlay({
  pinHash,
  pinLen,
  onUnlock,
}: {
  pinHash: string;
  pinLen: number;
  onUnlock: () => void;
}) {
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);
  const entryRef = useRef('');
  entryRef.current = entry;

  const verify = useCallback(
    (val: string) => {
      if (hashPin(val) === pinHash) {
        setEntry('');
        setError(false);
        onUnlock();
      } else {
        setError(true);
        setEntry('');
      }
    },
    [pinHash, onUnlock],
  );

  const pressDigit = useCallback(
    (d: string) => {
      setError(false);
      const next = (entryRef.current + d).slice(0, pinLen || 12);
      entryRef.current = next;
      setEntry(next);
      // PIN uzunluğuna ulaşıldığında Enter'a gerek olmadan otomatik doğrula.
      if (pinLen && next.length === pinLen) {
        setTimeout(() => verify(next), 120);
      }
    },
    [pinLen, verify],
  );

  const backspace = useCallback(() => {
    setError(false);
    const next = entryRef.current.slice(0, -1);
    entryRef.current = next;
    setEntry(next);
  }, []);

  // Fiziksel klavye desteği (rakam / Backspace / Enter).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        verify(entryRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressDigit, backspace, verify]);

  const dots = Array.from({ length: pinLen || entry.length || 4 });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/95 p-4 backdrop-blur">
      <div className="w-full max-w-xs space-y-5 rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-slate-800">
        <div>
          <div className="text-3xl">🔒</div>
          <p className="mt-2 font-semibold text-slate-800 dark:text-slate-100">
            Arayüz kilitli
          </p>
          <p className="text-xs text-slate-500">Açmak için PIN girin</p>
        </div>

        {/* PIN nokta göstergesi */}
        <div className="flex justify-center gap-2">
          {dots.map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < entry.length
                  ? error
                    ? 'bg-red-500'
                    : 'bg-slate-800 dark:bg-slate-100'
                  : 'bg-slate-300 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>
        {error && (
          <p className="text-sm font-medium text-red-600">
            Hatalı PIN, tekrar deneyin.
          </p>
        )}

        {/* Sayısal tuş takımı (dokunmatik için) */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pressDigit(d)}
              className="rounded-xl bg-slate-100 py-3 text-lg font-semibold text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={backspace}
            className="rounded-xl bg-slate-100 py-3 text-lg text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            aria-label="Sil"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={() => pressDigit('0')}
            className="rounded-xl bg-slate-100 py-3 text-lg font-semibold text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => verify(entry)}
            className="rounded-xl bg-emerald-600 py-3 text-lg font-semibold text-white hover:bg-emerald-700"
            aria-label="Onayla"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
