import React from 'react';
import { Search, Bell, Settings, Menu, Hammer, Wind } from 'lucide-react';
import { User, Page } from '../types';

interface NavbarProps {
  user: User;
  onToggleSidebar: () => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  onNavigate: (page: Page) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onToggleSidebar, onLogout, onSearch, onNavigate }) => {
  return (
    <nav className="sticky top-0 z-50 flex h-[50px] w-full items-center justify-between bg-[#232527] border-b border-[#393b3d] px-4">
      {/* Left */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onToggleSidebar}
          className="p-1 hover:bg-white/10 rounded-md transition-colors"
        >
          <Menu size={24} className="text-white" />
        </button>
        <div className="flex items-center gap-1 cursor-pointer" onClick={() => onNavigate(Page.HOME)}>
           {/* Glidrovia Logo: Hammer + Glider (Wind) */}
           <div className="flex items-center gap-1">
             <div className="w-8 h-8 bg-blue-600 rounded-lg border-2 border-white flex items-center justify-center shadow-lg relative">
               <Hammer size={16} className="text-white absolute -top-1 -left-1 transform -rotate-12" />
               <Wind size={16} className="text-white absolute -bottom-1 -right-1 transform rotate-12" />
             </div>
             <span className="text-2xl font-bold tracking-tight text-white hidden md:block font-['Gotham_SSm','Inter'] ml-2">
               Glidrovia
             </span>
           </div>
        </div>
        <div className="hidden md:flex gap-6 ml-6 text-white font-medium text-sm">
            <a href="#" onClick={() => onNavigate(Page.GAMES)} className="hover:opacity-80 transition-opacity">Descubrir</a>
            <a href="#" onClick={() => onNavigate(Page.STORE)} className="hover:opacity-80 transition-opacity text-gray-400">Tienda</a>
            <a href="#" onClick={() => onNavigate(Page.STUDIO)} className="hover:opacity-80 transition-opacity text-gray-400">Crear</a>
            <a href="#" className="hover:opacity-80 transition-opacity text-gray-400">Voxels</a>
        </div>
      </div>

      {/* Center Search */}
      <div className="hidden md:flex flex-1 max-w-2xl px-4">
        <div className="relative w-full">
            <input 
              type="text" 
              placeholder="Buscar experiencias o usuarios" 
              onChange={(e) => onSearch(e.target.value)}
              className="w-full bg-[#111213] text-white border border-[#393b3d] rounded-full py-1.5 pl-4 pr-10 focus:outline-none focus:border-white transition-colors text-sm"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 md:gap-4">
        <button className="text-white hover:bg-white/10 p-1 rounded-full hidden sm:block">
           <div className="flex items-center gap-1 bg-[#393b3d] px-3 py-1 rounded-full">
              <span className="w-4 h-4 bg-blue-500 rounded-sm rotate-45 flex items-center justify-center text-[8px] font-bold text-white">V</span>
              <span className="text-xs font-bold">{user.robux}</span>
           </div>
        </button>

        <button className="text-white hover:bg-white/10 p-1 rounded-full hidden sm:block" onClick={() => onNavigate(Page.STORE)}>
           <div className="flex items-center gap-1 bg-blue-600/20 border border-blue-500/30 px-3 py-1 rounded-full">
              <span className="text-blue-400 text-[10px] font-black">D</span>
              <span className="text-xs font-bold text-blue-400">{user.drovis || 0}</span>
           </div>
        </button>
        
        <button className="text-white hover:bg-white/10 p-2 rounded-full relative">
          <Bell size={22} />
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-[#232527]"></span>
        </button>
        
        <button 
            onClick={() => onNavigate(Page.SETTINGS)}
            className="text-white hover:bg-white/10 p-2 rounded-full" 
            title="Ajustes"
        >
          <Settings size={22} />
        </button>
        
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-bold hidden lg:block">{user.displayName}</span>
          <div className="w-8 h-8 rounded-full bg-gray-500 overflow-hidden border border-gray-600 cursor-pointer" onClick={() => onNavigate(Page.PROFILE)}>
             {/* Placeholder for user avatar in nav */}
             <div className="w-full h-full bg-gradient-to-tr from-yellow-400 to-yellow-200"></div>
          </div>
          <button 
              onClick={onLogout}
              className="text-xs text-gray-400 hover:text-white font-bold ml-1"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
};