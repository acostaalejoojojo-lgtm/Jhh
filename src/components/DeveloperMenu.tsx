import React, { useState } from 'react';
import { Terminal, Upload, Play, Plus, X, Music, Video, Star, Heart, Smile } from 'lucide-react';
import { User, Page, AvatarConfig, Emote } from '../types';
import { dataService } from '../lib/dataService';

interface DeveloperMenuProps {
  user: User;
  setUser: (user: User) => void;
  avatarConfig: AvatarConfig;
  onUpdateAvatar: (config: AvatarConfig) => void;
}

export const DeveloperMenu: React.FC<DeveloperMenuProps> = ({ user, setUser, avatarConfig, onUpdateAvatar }) => {
  const [activeTab, setActiveTab] = useState<'animations' | 'emotes' | 'settings'>('animations');
  const [newEmote, setNewEmote] = useState<Partial<Emote>>({ id: '', name: '', animationUrl: '', soundUrl: '' });
  const [isAddingEmote, setIsAddingEmote] = useState(false);
  const [emoteButtonText, setEmoteButtonText] = useState(avatarConfig.customAnimations?.emoteButtonText || 'Emotes');

  const isDeveloper = user.uid === 'admin' || user.username?.toLowerCase() === 'glidrovia';

  const handleUpdateEmoteText = (text: string) => {
    if (!isDeveloper) return;
    setEmoteButtonText(text);
    const newConfig = {
      ...avatarConfig,
      customAnimations: {
        ...(avatarConfig.customAnimations || {}),
        emoteButtonText: text
      }
    };
    onUpdateAvatar(newConfig);
  };

  const handleUpdateAnimationUrl = async (type: 'idleUrl' | 'walkUrl' | 'jumpUrl' | 'emote1Url', url: string) => {
    const newConfig = {
      ...avatarConfig,
      customAnimations: {
        ...(avatarConfig.customAnimations || {}),
        [type]: url
      }
    };
    onUpdateAvatar(newConfig);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'idleUrl' | 'walkUrl' | 'jumpUrl' | 'emote1Url' | 'emote') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await dataService.uploadFile(file);
      if (type === 'emote') {
        setNewEmote(prev => ({ ...prev, animationUrl: url }));
      } else {
        handleUpdateAnimationUrl(type, url);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Error al subir archivo");
    }
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await dataService.uploadFile(file);
      setNewEmote(prev => ({ ...prev, soundUrl: url }));
    } catch (err) {
      console.error("Sound upload failed:", err);
    }
  };

  const handleAddEmote = () => {
    if (!newEmote.name || !newEmote.animationUrl) {
      alert("Nombre y Animación son obligatorios");
      return;
    }

    const emote: Emote = {
      id: Date.now().toString(),
      name: newEmote.name,
      animationUrl: newEmote.animationUrl,
      soundUrl: newEmote.soundUrl || null
    };

    const newConfig = {
      ...avatarConfig,
      customAnimations: {
        ...(avatarConfig.customAnimations || {}),
        emotes: [...(avatarConfig.customAnimations?.emotes || []), emote]
      }
    };
    
    onUpdateAvatar(newConfig);
    setNewEmote({ id: '', name: '', animationUrl: '', soundUrl: '' });
    setIsAddingEmote(false);
  };

  const removeEmote = (id: string) => {
    const newConfig = {
      ...avatarConfig,
      customAnimations: {
        ...(avatarConfig.customAnimations || {}),
        emotes: (avatarConfig.customAnimations?.emotes || []).filter(e => e.id !== id)
      }
    };
    onUpdateAvatar(newConfig);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#1a1b1e] custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-blue-600/20 p-3 rounded-2xl border border-blue-500/50">
            <Terminal className="text-blue-400" size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">Panel de Desarrollador</h1>
            <p className="text-blue-400 font-bold tracking-widest text-xs uppercase">Gestión de Animaciones y Experiencia</p>
          </div>
        </div>

        <div className="flex gap-2 mb-8 bg-[#2b2d31] p-1 rounded-xl border border-gray-700 w-fit">
          <button 
            onClick={() => setActiveTab('animations')}
            className={`px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'animations' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            Sincronización 3D
          </button>
          <button 
            onClick={() => setActiveTab('emotes')}
            className={`px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'emotes' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            Gestión de Emotes
          </button>
          {isDeveloper && (
            <button 
                onClick={() => setActiveTab('settings')}
                className={`px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
                Configuración
            </button>
          )}
        </div>

        {activeTab === 'animations' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 p-8 rounded-3xl border border-white/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Smile size={80} />
              </div>
              <h2 className="text-xl font-black text-white uppercase italic mb-2 tracking-tight">Modelo Base Global</h2>
              <p className="text-gray-400 text-sm mb-6 font-medium">Define el modelo principal (.glb/.fbx) que servirá de base para todas tus animaciones.</p>
              
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <input 
                    type="text"
                    value={avatarConfig.customModelUrl || ''}
                    placeholder="URL del modelo base (https://...)"
                    onChange={(e) => onUpdateAvatar({ ...avatarConfig, customModelUrl: e.target.value })}
                    className="w-full bg-black/40 border-2 border-gray-800 focus:border-blue-500 rounded-xl px-4 py-3 text-white font-mono text-sm transition-all focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
                <label className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-xs px-6 py-3 rounded-xl cursor-pointer transition-all flex items-center gap-2 h-[50px] shadow-lg shadow-blue-900/40 active:scale-95 leading-none">
                  <Upload size={16} />
                  Subir Base
                  <input type="file" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) dataService.uploadFile(file).then(url => onUpdateAvatar({ ...avatarConfig, customModelUrl: url }));
                  }} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: 'idleUrl', label: 'Idle (Reposo)', icon: Star },
              { id: 'walkUrl', label: 'Walk (Caminar)', icon: Play },
              { id: 'jumpUrl', label: 'Jump (Salto)', icon: Upload },
              { id: 'emote1Url', label: 'Emote 1 (Gestos)', icon: Smile },
            ].map((slot) => (
              <div key={slot.id} className="bg-[#1e1f21] p-6 rounded-2xl border border-gray-800 hover:border-blue-500/50 transition-all group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-blue-600/20 transition-colors">
                    <slot.icon size={18} className="text-gray-400 group-hover:text-blue-400" />
                  </div>
                  <h3 className="text-white font-bold text-sm uppercase tracking-tight italic">{slot.label}</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={(avatarConfig.customAnimations as any)?.[slot.id] || ''}
                      onChange={(e) => handleUpdateAnimationUrl(slot.id as any, e.target.value)}
                      placeholder="URL de animación (.glb / .fbx)"
                      className="w-full bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs focus:border-blue-500 outline-none transition-all pr-10"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      <Upload size={14} />
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-center gap-2 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg cursor-pointer transition-all border border-gray-700/50 text-[10px] font-black uppercase tracking-widest">
                    <Upload size={12} />
                    Subir Archivo
                    <input type="file" className="hidden" accept=".glb,.gltf,.fbx" onChange={(e) => handleFileUpload(e, slot.id as any)} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'emotes' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold uppercase italic tracking-tighter text-sm flex items-center gap-2">
                <Heart size={18} className="text-red-500" />
                Emotes Disponibles
              </h3>
              <button 
                onClick={() => setIsAddingEmote(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all"
              >
                <Plus size={14} />
                Añadir Emote
              </button>
            </div>

            {isAddingEmote && (
              <div className="bg-[#2b2d31] p-6 rounded-2xl border border-blue-500/30 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-white font-bold text-sm">Nuevo Emote</h4>
                  <button onClick={() => setIsAddingEmote(false)} className="text-gray-500 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Nombre del Emote</label>
                      <input 
                        type="text" 
                        value={newEmote.name}
                        onChange={(e) => setNewEmote({...newEmote, name: e.target.value})}
                        className="w-full bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none"
                        placeholder="Ej: Baile Épico"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Animación (.glb / .fbx)</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={newEmote.animationUrl || ''}
                          onChange={(e) => setNewEmote({...newEmote, animationUrl: e.target.value})}
                          className="flex-1 bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs focus:border-blue-500 outline-none"
                          placeholder="URL o sube un archivo"
                        />
                        <label className="p-3 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-700 transition-colors">
                          <Upload size={18} className="text-blue-400" />
                          <input type="file" className="hidden" accept=".glb,.gltf,.fbx" onChange={(e) => handleFileUpload(e, 'emote')} />
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Sonido Opcional (.mp3)</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={newEmote.soundUrl || ''}
                          onChange={(e) => setNewEmote({...newEmote, soundUrl: e.target.value})}
                          className="flex-1 bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs focus:border-blue-500 outline-none"
                          placeholder="URL de audio"
                        />
                        <label className="p-3 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-700 transition-colors">
                          <Music size={18} className="text-purple-400" />
                          <input type="file" className="hidden" accept=".mp3,.wav" onChange={handleSoundUpload} />
                        </label>
                      </div>
                    </div>
                    
                    <div className="pt-6">
                      <button 
                        onClick={handleAddEmote}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
                      >
                        Guardar Emote
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(avatarConfig.customAnimations?.emotes || []).map((emote) => (
                <div key={emote.id} className="bg-[#1e1f21] p-4 rounded-xl border border-gray-800 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-blue-400">
                      <Video size={18} />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{emote.name}</p>
                      <p className="text-[9px] text-gray-500 uppercase font-black">Emote Personalizado</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeEmote(emote.id)}
                    className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              
              {(avatarConfig.customAnimations?.emotes || []).length === 0 && !isAddingEmote && (
                <div className="col-span-full py-12 flex flex-col items-center justify-center bg-[#111213] rounded-2xl border-2 border-dashed border-gray-800">
                  <Heart size={32} className="text-gray-700 mb-4" />
                  <p className="text-gray-500 font-bold text-sm">No has añadido emotes todavía.</p>
                  <p className="text-gray-600 text-xs text-center mt-1">Usa el botón de arriba para añadir gestos <br/> y movimientos especiales.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#1e1f21] p-8 rounded-2xl border border-gray-800 animate-in fade-in zoom-in-95">
             <div className="flex items-center gap-3 mb-6">
                <SettingsIcon className="text-gray-400" size={24} />
                <h3 className="text-white font-black uppercase italic italic text-xl">Configuración Maestra</h3>
             </div>
             
             <div className="space-y-6 max-w-md">
                <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Texto del Botón de Emotes</label>
                    <input 
                        type="text"
                        value={emoteButtonText}
                        onChange={(e) => handleUpdateEmoteText(e.target.value)}
                        className="w-full bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white font-bold focus:border-blue-500 outline-none"
                    />
                    <p className="mt-2 text-[9px] text-gray-500 font-bold uppercase">Solo tú puedes ver y editar esta configuración como desarrollador.</p>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

import { Trash2, Settings as SettingsIcon } from 'lucide-react';
