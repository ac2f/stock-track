import { Component, type ReactNode } from 'react';

/**
 * Bir ekranın çiziminde beklenmeyen bir hata olursa bütün uygulama boş
 * ekrana düşmesin: menü yerinde kalır, ekranın yerine kısa bir uyarı çıkar.
 * `resetKey` değişince (başka ekrana geçince) yeniden denenir.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card space-y-3">
        <h1 className="text-lg font-semibold">Bu ekranda bir sorun çıktı</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Diğer ekranlar çalışıyor; sıradaki işlemler kaybolmadı. Sayfayı yenileyip
          yeniden deneyin.
        </p>
        <p className="break-all font-mono text-xs text-slate-400">{this.state.error.message}</p>
        <button type="button" className="btn-secondary btn-sm" onClick={() => window.location.reload()}>
          Sayfayı yenile
        </button>
      </div>
    );
  }
}
