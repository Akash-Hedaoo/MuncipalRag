import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  ShieldCheck,
  Sun,
  UserCircle2,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

const AppShell = ({ darkMode, onToggleDarkMode }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/chat', label: 'Chat', icon: MessageSquareText },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/chat')) return 'Chat Workspace';
    if (location.pathname.startsWith('/admin')) return 'Admin Uploads';
    return 'Dashboard';
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 border-b border-[#ebe5dc] px-4 py-4 dark:border-[#5a3c2f]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-moss-600 text-white dark:bg-[#fde6d8] dark:text-[#bf6336]">
          <FileText size={18} />
        </div>
        {!isSidebarCollapsed && (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6b7280] dark:text-[#c8a99a]">MuniRules</p>
            <p className="truncate text-base font-semibold text-[#1a1a1a] dark:text-[#f3e4db]">RAG Assistant</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setIsMobileSidebarOpen(false)}
            className={({ isActive }) =>
              `group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-moss-600 text-white dark:bg-[#fde6d8] dark:text-[#bf6336]'
                  : 'text-[#6b7280] hover:bg-moss-100 hover:text-moss-700 dark:text-[#d7b8a7] dark:hover:bg-[#3a2419] dark:hover:text-[#f3e4db]'
              }`
            }
            title={isSidebarCollapsed ? label : undefined}
          >
            {React.createElement(icon, { size: 18 })}
            {!isSidebarCollapsed && <span className="font-medium">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[#ebe5dc] p-3 dark:border-[#5a3c2f]">
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#e6e0d6] bg-cream-100 px-3 py-2 dark:border-[#5a3c2f] dark:bg-[#2f1e16]">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-moss-600 text-white dark:bg-[#fde6d8] dark:text-[#bf6336]">
            <UserCircle2 size={16} />
          </div>
          {!isSidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1a1a1a] dark:text-[#f3e4db]">{user?.fullName}</p>
              <p className="truncate text-xs uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#c8a99a]">{user?.role}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleDarkMode}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#e2ddd4] bg-cream-50 text-[#6b7280] transition hover:bg-moss-100 hover:text-moss-700 dark:border-[#5a3c2f] dark:bg-[#2f1e16] dark:text-[#d7b8a7] dark:hover:bg-[#3a2419] dark:hover:text-[#f3e4db]"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {!isSidebarCollapsed && (
            <button
              onClick={handleLogout}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[#f3d8c7] bg-moss-100 px-3 text-sm font-medium text-moss-700 transition hover:bg-[#f3d6c5] hover:text-moss-700 dark:border-[#5a3c2f] dark:bg-[#3a2419] dark:text-[#f5d6c4] dark:hover:bg-[#4b2f21]"
            >
              <LogOut size={15} />
              Logout
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-cream-100 text-[#1a1a1a] dark:bg-[#0d1612] dark:text-[#f3e4db]">
      <aside
        className={`hidden border-r border-[#ebe5dc] bg-cream-50 transition-[width] duration-200 dark:border-[#5a3c2f] dark:bg-[#2a1a13] lg:flex lg:flex-col ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="absolute left-full top-6 z-10 -ml-3">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e2ddd4] bg-cream-50 text-[#6b7280] shadow-sm transition hover:text-[#1a1a1a] dark:border-[#5a3c2f] dark:bg-[#2a1a13] dark:text-[#d7b8a7] dark:hover:text-[#f3e4db]"
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
        {sidebarContent}
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#ebe5dc] bg-cream-50/95 px-4 backdrop-blur md:px-6 dark:border-[#5a3c2f] dark:bg-[#2a1a13]/90">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e2ddd4] text-[#6b7280] transition hover:bg-moss-100 hover:text-moss-700 lg:hidden dark:border-[#5a3c2f] dark:text-[#d7b8a7] dark:hover:bg-[#3a2419] dark:hover:text-[#f3e4db]"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#c8a99a]">Workspace</p>
              <h1 className="text-base font-semibold text-[#1a1a1a] dark:text-[#f3e4db]">{pageTitle}</h1>
            </div>
          </div>
        </header>

        <main className="flex flex-1 min-h-0 overflow-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {isMobileSidebarOpen && (
        <>
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Close navigation overlay"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#ebe5dc] bg-cream-50 shadow-xl lg:hidden dark:border-[#5a3c2f] dark:bg-[#2a1a13]">
            <div className="flex items-center justify-end border-b border-[#ebe5dc] p-3 dark:border-[#5a3c2f]">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e2ddd4] text-[#6b7280] transition hover:bg-moss-100 hover:text-moss-700 dark:border-[#5a3c2f] dark:text-[#d7b8a7] dark:hover:bg-[#3a2419] dark:hover:text-[#f3e4db]"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}
    </div>
  );
};

export default AppShell;
