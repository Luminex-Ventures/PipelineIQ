import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, TrendingUp, BarChart3, Sparkles, ChevronDown, User, Settings, Sliders, Users, LogOut, Menu, X, Upload } from 'lucide-react';
import ImportDealsModal from './ImportDealsModal';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const isPipelinePage = currentPage === 'pipeline';

  const navigation = [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' },
    { name: 'Pipeline', icon: TrendingUp, page: 'pipeline' },
    { name: 'Analytics', icon: BarChart3, page: 'analytics' },
    { name: 'Luma AI', icon: Sparkles, page: 'luma' }
  ];

  const settingsPages = ['settings', 'pipeline-settings', 'lead-sources'];
  const isSettingsActive = settingsPages.includes(currentPage);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img
                src="/image.png"
                alt="PipelineIQ"
                className="h-10"
              />
            </div>

            <div className="hidden md:flex items-center space-x-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.page}
                    onClick={() => onNavigate(item.page)}
                    className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 ${
                      currentPage === item.page
                        ? 'bg-sky-50 text-sky-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                    <span className="font-medium text-sm">{item.name}</span>
                  </button>
                );
              })}

              <div className="relative ml-2" ref={settingsRef}>
                <button
                  onClick={() => setSettingsMenuOpen(!settingsMenuOpen)}
                  className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 ${
                    isSettingsActive
                      ? 'bg-sky-50 text-sky-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <User className="w-5 h-5" strokeWidth={2} />
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${settingsMenuOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
                </button>

                {settingsMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={() => {
                        onNavigate('pipeline-settings');
                        setSettingsMenuOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left flex items-center space-x-3 transition-colors duration-200 ${
                        currentPage === 'pipeline-settings'
                          ? 'bg-sky-50 text-sky-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Sliders className="w-5 h-5" strokeWidth={2} />
                      <span className="font-medium text-sm">Pipeline Config</span>
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('lead-sources');
                        setSettingsMenuOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left flex items-center space-x-3 transition-colors duration-200 ${
                        currentPage === 'lead-sources'
                          ? 'bg-sky-50 text-sky-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Users className="w-5 h-5" strokeWidth={2} />
                      <span className="font-medium text-sm">Lead Sources</span>
                    </button>
                    <button
                      onClick={() => {
                        onNavigate('settings');
                        setSettingsMenuOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left flex items-center space-x-3 transition-colors duration-200 ${
                        currentPage === 'settings'
                          ? 'bg-sky-50 text-sky-600'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Settings className="w-5 h-5" strokeWidth={2} />
                      <span className="font-medium text-sm">Account Settings</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowImportModal(true);
                        setSettingsMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left flex items-center space-x-3 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    >
                      <Upload className="w-5 h-5" strokeWidth={2} />
                      <span className="font-medium text-sm">Import CSV</span>
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      onClick={() => {
                        signOut();
                        setSettingsMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left flex items-center space-x-3 text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    >
                      <LogOut className="w-5 h-5" strokeWidth={2} />
                      <span className="font-medium text-sm">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors duration-200"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-4 py-4 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.page}
                    onClick={() => {
                      onNavigate(item.page);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors duration-200 ${
                      currentPage === item.page
                        ? 'bg-sky-50 text-sky-600'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                    <span className="font-medium">{item.name}</span>
                  </button>
                );
              })}

              <div className="pt-2 mt-2 border-t border-gray-200">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide px-4 mb-2">
                  Configuration
                </div>
                <button
                  onClick={() => {
                    onNavigate('pipeline-settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors duration-200 ${
                    currentPage === 'pipeline-settings'
                      ? 'bg-sky-50 text-sky-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Sliders className="w-5 h-5" strokeWidth={2} />
                  <span className="font-medium">Pipeline Config</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('lead-sources');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors duration-200 ${
                    currentPage === 'lead-sources'
                      ? 'bg-sky-50 text-sky-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Users className="w-5 h-5" strokeWidth={2} />
                  <span className="font-medium">Lead Sources</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors duration-200 ${
                    currentPage === 'settings'
                      ? 'bg-sky-50 text-sky-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Settings className="w-5 h-5" strokeWidth={2} />
                  <span className="font-medium">Account Settings</span>
                </button>
              </div>

              <div className="pt-2 mt-2 border-t border-gray-200">
                <button
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg flex items-center space-x-3 transition-colors duration-200"
                >
                  <LogOut className="w-5 h-5" strokeWidth={2} />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className={isPipelinePage ? "max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>
        {children}
      </main>

      {showImportModal && (
        <ImportDealsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            if (currentPage === 'pipeline') {
              window.location.reload();
            }
          }}
        />
      )}
    </div>
  );
}
