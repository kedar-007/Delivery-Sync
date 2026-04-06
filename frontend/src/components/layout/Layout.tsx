import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';
import { FestivalProvider } from '../../contexts/FestivalContext';
import AmbientFestival from '../ui/AmbientFestival';
import SuspendedScreen from '../ui/SuspendedScreen';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed } = useSidebar();
  const { user, suspensionInfo } = useAuth();

  if (suspensionInfo) {
    return <SuspendedScreen info={suspensionInfo} />;
  }

  return (
    <FestivalProvider>
      <div
        className="flex h-screen overflow-hidden"
        style={{ backgroundColor: `rgb(var(--ds-bg))`, position: 'relative' }}
      >
        {/* Ambient festival particles — behind all content, never blocks clicks */}
        <AmbientFestival />

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <div
          className={`
            fixed inset-y-0 left-0 z-30 transform transition-transform duration-200 ease-in-out
            lg:relative lg:translate-x-0 lg:z-auto lg:flex lg:shrink-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            ${collapsed ? 'w-16' : 'w-60'}
          `}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ position: 'relative', zIndex: 2 }}>
          {/* Mobile top bar */}
          <div
            className="lg:hidden flex items-center gap-3 px-4 py-3 border-b shrink-0"
            style={{
              backgroundColor: `rgb(var(--ds-sidebar-bg))`,
              borderColor: `rgb(var(--ds-sidebar-border))`,
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="p-1.5 rounded-lg opacity-80 hover:opacity-100 transition-opacity shrink-0"
              style={{ color: `rgb(var(--ds-sidebar-text))` }}
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p
                className="font-bold text-sm leading-tight truncate"
                style={{ color: `rgb(var(--ds-sidebar-text))` }}
              >
                {user?.tenantName || 'My Organisation'}
              </p>
              <p
                className="text-[10px] font-medium uppercase tracking-wide opacity-50 leading-tight"
                style={{ color: `rgb(var(--ds-sidebar-text))` }}
              >
                Delivery Sync
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </FestivalProvider>
  );
};

export default Layout;
