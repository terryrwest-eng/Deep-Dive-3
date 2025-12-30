import { 
  FileText, LayoutDashboard, Settings, Menu
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

const Layout = ({ children }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <div className="flex min-h-screen bg-[#09090b] text-[#fafafa]">
      {/* Sidebar */}
      <aside className={`border-r border-[#27272a] bg-[#121214] transition-all duration-300 ${collapsed ? "w-16" : "w-64"} flex flex-col`}>
        <div className="p-4 border-b border-[#27272a] flex items-center justify-between">
          {!collapsed && <span className="font-bold text-[#F59E0B] tracking-tight">Field Report AI</span>}
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa]"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive("/") 
                ? "bg-[#F59E0B]/10 text-[#F59E0B]" 
                : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a]"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          <Link
            to="/deep-dive"
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive("/deep-dive") 
                ? "bg-[#F59E0B]/10 text-[#F59E0B]" 
                : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a]"
            }`}
          >
            <FileText className="w-4 h-4" />
            {!collapsed && <span>Deep Dive</span>}
          </Link>
        </nav>

        <div className="p-4 border-t border-[#27272a]">
          {!collapsed && (
            <div className="text-xs text-[#52525b]">
              v1.0.0
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
};

export default Layout;
