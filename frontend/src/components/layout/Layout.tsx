import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: `rgb(var(--ds-bg))` }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — off-canvas on mobile, static on desktop */}
      <div className={`
        fixed inset-y-0 left-0 z-30 transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:z-auto lg:flex lg:shrink-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'w-16' : 'w-60'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
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
            className="p-1.5 rounded-lg opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: `rgb(var(--ds-sidebar-text))` }}
          >
            <Menu size={20} />
          </button>
          <span className="font-semibold text-sm" style={{ color: `rgb(var(--ds-sidebar-text))` }}>
            Delivery Sync
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
