import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../api';
import { useSession } from '../session';

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-ink text-paper' : 'hover:bg-line/60'}`;
}

export function Layout() {
  const { me, isStaff, refresh } = useSession();
  const navigate = useNavigate();
  const fullBleed = useLocation().pathname === '/';

  async function logout() {
    await api('/auth/logout', { body: {} });
    await refresh();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4">
            <span className="font-display text-2xl font-bold tracking-tight">tangossip</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            <NavLink to="/kisiler" className={navClass}>
              Kişiler
            </NavLink>
            <NavLink to="/paylas" className={navClass}>
              Hikayeni paylaş
            </NavLink>
            <NavLink to="/kurallar" className={navClass}>
              Kurallar
            </NavLink>
            {isStaff && (
              <NavLink to="/yonetim" className={navClass}>
                Yönetim
              </NavLink>
            )}
          </nav>
          <div className="flex items-center gap-1">
            {me ? (
              <>
                <NavLink to="/hesabim" className={navClass}>
                  {me.name.split(' ')[0]}
                </NavLink>
                <button onClick={logout} className="rounded-md px-3 py-1.5 text-sm hover:bg-line/60" title="Çıkış yap">
                  Çıkış
                </button>
              </>
            ) : (
              <>
                <NavLink to="/giris" className={navClass}>
                  Giriş
                </NavLink>
                <NavLink to="/kayit" className={navClass}>
                  Kayıt ol
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={fullBleed ? 'flex-1' : 'mx-auto w-full max-w-6xl flex-1 px-4 py-8'}>
        <Outlet />
      </main>
      <footer className="border-t border-line py-6 text-xs text-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4">
          <Link to="/kurallar">İçerik kuralları</Link>
          <Link to="/kullanim-sartlari">Kullanım şartları</Link>
          <Link to="/kvkk">KVKK aydınlatma metni</Link>
          <Link to="/kaldirma-talebi">Kaldırma talebi</Link>
        </div>
      </footer>
    </div>
  );
}
