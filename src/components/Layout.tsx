import { useState } from "react";
import {
  Download,
  Server,
  Search,
  FileText,
  Settings,
  Menu,
  X,
  Radio,
  BarChart2,
  Scale,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTransferInfo, useServerState } from "@/hooks/useApi";

type Tab =
  | "torrents"
  | "add"
  | "rss"
  | "search"
  | "logs"
  | "settings"
  | "stats";

interface LayoutProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}

export function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout } = useAuth();
  const { data: transferInfo } = useTransferInfo();
  const { data: state } = useServerState();

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "torrents",
      label: "Torrents",
      icon: <Download className="h-5 w-5" />,
    },
    { id: "add", label: "Add", icon: <Server className="h-5 w-5" /> },
    { id: "rss", label: "RSS", icon: <Radio className="h-5 w-5" /> },
    { id: "search", label: "Search", icon: <Search className="h-5 w-5" /> },
    { id: "logs", label: "Logs", icon: <FileText className="h-5 w-5" /> },
    { id: "stats", label: "Stats", icon: <BarChart2 className="h-5 w-5" /> },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
            <h1
              className="text-lg font-semibold hidden sm:block"
              style={{ fontFamily: "Silkscreen", fontSize: 24 }}
            >
              qBittorrent
            </h1>
          </div>

          {/* Transfer stats */}
          {transferInfo && (
            <div className="flex items-center gap-3 text-xs">
              <div className="hidden sm:flex items-center gap-1">
                <span className="text-sm text-muted-foreground">
                  <Scale className="mb-1 h-4 w-4" />
                </span>
                <span>
                  {state ? parseFloat(state.global_ratio).toFixed(3) : "—"}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1">
                <span className="text-green-500">↓</span>
                <span>
                  {(transferInfo.dl_info_speed / 1024).toFixed(1)} KB/s
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1">
                <span className="text-blue-500">↑</span>
                <span>
                  {(transferInfo.up_info_speed / 1024).toFixed(1)} KB/s
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t">
            <nav className="flex flex-col p-2">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "secondary" : "ghost"}
                  className="justify-start gap-2"
                  onClick={() => {
                    onTabChange(tab.id);
                    setMobileMenuOpen(false);
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                className="justify-start gap-2 text-muted-foreground mt-1 border-t pt-2 rounded-none"
                onClick={logout}
              >
                <LogOut className="h-5 w-5" />
                Logout
              </Button>
            </nav>
          </div>
        )}
      </header>

      {/* Desktop sidebar + main content */}
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-48 flex-col border-r p-2 gap-1 sticky top-14 self-start h-[calc(100vh-56px)] overflow-y-auto pb-4">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "secondary" : "ghost"}
              className="justify-start gap-2"
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </Button>
          ))}
          <div className="mt-auto pt-2 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={logout}
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur">
        <div className="flex justify-around py-2">
          {tabs.slice(0, 5).map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 rounded-md",
                activeTab === tab.id ? "text-primary" : "text-muted-foreground",
              )}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon}
              <span className="text-[10px]">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
