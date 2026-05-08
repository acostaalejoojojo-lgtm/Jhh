import React from 'react';
import { Home, Gamepad2, User as UserIcon, MessageSquare, Users, Shirt, MonitorPlay, Hammer, Settings as SettingsIcon, Shield, Terminal } from 'lucide-react';
import { Page, User, getRankInfo } from '../types';

interface SidebarProps {
  isOpen: boolean;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: User | null;
  t: any;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, currentPage, onNavigate, user, t }) => {
  const sidebarClass = isOpen ? "w-64" : "w-0 md:w-16";
  const rankInfo = getRankInfo(user?.xp || 0);
  
  const navItems = [
    { id: Page.HOME, icon: Home, label: t.home },
    { id: Page.PROFILE, icon: UserIcon, label: t.profile },
    { id: Page.GAMES, icon: MonitorPlay, label: t.experiences },
    { id: Page.AVATAR, icon: Shirt, label: t.avatar },
    { id: Page.STUDIO, icon: Hammer, label: t.create },
    { id: Page.SOCIAL, icon: Users, label: t.friends },
    { id: Page.SETTINGS, icon: SettingsIcon, label: t.settings },
  ];

  if (user?.isAdmin) {
    navItems.push({ id: Page.DEVELOPER, icon: Terminal, label: 'Desarrollador' });
  }

  return (
    <aside className={`${sidebarClass} fixed left-0 top-[50px] bottom-0 z-40 flex flex-col bg-[#232527] transition-all duration-300 overflow-hidden border-r border-[#393b3d]`}>
      <div className="flex flex-col py-2">
        
        <div className={`px-4 py-4 flex flex-col gap-3 mb-2 ${!isOpen && 'md:items-center'}`}>
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 min-w-[32px] rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 border border-gray-600 overflow-hidden">
                {user?.avatarConfig?.faceTextureUrl ? (
                  <img src={user.avatarConfig.faceTextureUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserIcon size={16} className="text-white/50" />
                  </div>
                )}
              </div>
              <span className={`font-bold text-base truncate text-white ${!isOpen && 'hidden'}`}>{user?.displayName || 'Guest'}</span>
           </div>

           {isOpen && user && (
             <div className="flex flex-col gap-1.5 px-1">
                <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-wider">
                  <span style={{ color: rankInfo.color }} className="flex items-center gap-1">
                    {(rankInfo as any).iconUrl ? (
                      <img src={(rankInfo as any).iconUrl} alt="" className="w-3 h-3 object-contain shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <Shield size={10} />
                    )}
                    {rankInfo.name}
                  </span>
                  <span className="text-gray-500">XP: {user.xp || 0}</span>
                </div>
                <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="h-full transition-all duration-1000 ease-out"
                    style={{ 
                      width: `${rankInfo.progress}%`,
                      backgroundColor: rankInfo.color,
                      boxShadow: `0 0 8px ${rankInfo.color}40`
                    }}
                  />
                </div>
             </div>
           )}
        </div>

        <div className="h-px bg-[#393b3d] w-11/12 mx-auto mb-2"></div>

        <ul className="flex flex-col gap-1 px-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                   onNavigate(item.id as Page);
                }}
                className={`flex items-center gap-3 w-full p-2 rounded-md transition-colors ${
                  currentPage === item.id 
                    ? "bg-white/10 text-white" 
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                } ${!isOpen && 'md:justify-center'}`}
              >
                <item.icon size={22} />
                <span className={`font-medium text-sm ${!isOpen && 'hidden'}`}>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="mt-auto p-4">
        {isOpen && (
             <div className="text-xs text-gray-500">
               <p>© 2024 Glidrovia Corp.</p>
               <p className="mt-1">Términos • Privacidad</p>
             </div>
        )}
      </div>
    </aside>
  );
};