import React, { useState } from 'react';
import { Hammer, Wind, CheckCircle2 } from 'lucide-react';
import { TermsModal } from '../components/TermsModal';

interface LoginProps {
  onLogin: (username: string, password?: string) => void;
  onGoogleLogin: () => void;
}

export const LoginPage: React.FC<LoginProps> = ({ onLogin, onGoogleLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setShowTerms(true);
      return;
    }
    if (username.trim()) {
      onLogin(username, password);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#000] font-sans relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
          <img 
            src="/uploads/1776033266918-654507261.jpg" 
            className="w-full h-full object-cover opacity-60" 
            alt="Background"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80"></div>
      </div>

      {/* Top Bar Login */}
      <header className="w-full bg-black/40 backdrop-blur-md border-b border-white/10 p-4 flex justify-between items-center shadow-2xl z-10">
        <div className="flex items-center ml-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl border-2 border-white flex items-center justify-center shadow-lg relative mr-4">
                <Hammer size={24} className="text-white absolute -top-1 -left-1 transform -rotate-12" />
                <Wind size={24} className="text-white absolute -bottom-1 -right-1 transform rotate-12" />
            </div>
            <div>
                <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none">Glidrovia</h1>
                <p className="text-[10px] text-blue-400 font-bold tracking-[0.2em] uppercase mt-1">Construye tu Realidad</p>
            </div>
        </div>
        
        <div className="hidden md:flex items-center gap-4 mr-4">
            <input 
               type="text" 
               placeholder="Usuario"
               className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-blue-500 transition-all w-40"
               value={username}
               onChange={(e) => setUsername(e.target.value)}
            />
            <input 
               type="password" 
               placeholder="Contraseña"
               className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-blue-500 transition-all w-40"
               value={password}
               onChange={(e) => setPassword(e.target.value)}
            />
            <button 
                onClick={() => {
                  if (acceptedTerms) {
                    onLogin(username || 'Invitado', password);
                  } else {
                    setShowTerms(true);
                  }
                }}
                className={`font-bold py-2 px-6 rounded-xl text-sm transition-all shadow-lg active:scale-95 ${acceptedTerms ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20' : 'bg-blue-600/50 hover:bg-blue-500/50 text-white shadow-blue-600/10 border border-white/10 opacity-80'}`}
            >
                Entrar
            </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1400px] w-full mx-auto p-6 md:p-12 gap-12 z-10">
         
         {/* Left Side: Promo Content */}
         <div className="flex-1 flex flex-col justify-center items-center md:items-start text-center md:text-left">
            <div className="inline-block px-4 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold uppercase tracking-widest mb-6">
                Beta Abierta 2026
            </div>
            <h2 className="text-5xl md:text-7xl font-black text-white mb-8 tracking-tight leading-[1.1]">
                Crea, Juega y <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Conecta</span> en Tiempo Real
            </h2>
            <p className="text-xl text-gray-300 mb-10 max-w-xl leading-relaxed font-medium">
                La plataforma definitiva donde tus ideas cobran vida con tecnología de sockets de última generación.
            </p>
            
            <div className="flex flex-wrap gap-6 opacity-80">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-blue-400">
                        <span className="text-2xl">⚡</span>
                    </div>
                    <div>
                        <div className="text-white font-bold">Sincronización</div>
                        <div className="text-gray-500 text-xs">Sockets 100% Real-time</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-purple-400">
                        <span className="text-2xl">🎨</span>
                    </div>
                    <div>
                        <div className="text-white font-bold">Creatividad</div>
                        <div className="text-gray-500 text-xs">Editor Voxel Avanzado</div>
                    </div>
                </div>
            </div>
         </div>

         {/* Right Side: Sign Up Card */}
         <div className="w-full md:w-[450px] bg-black/60 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl self-center">
             <h3 className="text-3xl font-bold text-white mb-2">Únete ahora</h3>
             <p className="text-gray-400 mb-8">Crea tu cuenta en segundos y empieza a jugar.</p>
             
             <form onSubmit={handleLogin} className="flex flex-col gap-5">
                 <div className="space-y-2">
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Usuario</label>
                     <input 
                        type="text" 
                        placeholder="Tu nombre de usuario"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder-white/20"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                     />
                 </div>

                 <div className="space-y-2">
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Contraseña</label>
                     <input 
                        type="password" 
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder-white/20"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                     />
                 </div>

                 <div className="flex items-start gap-3 mt-2 px-2">
                     <button 
                        type="button"
                        onClick={() => setAcceptedTerms(!acceptedTerms)}
                        className={`mt-0.5 w-5 h-5 rounded border ${acceptedTerms ? 'bg-blue-600 border-blue-600 flex items-center justify-center' : 'bg-white/5 border-white/20'}`}
                     >
                        {acceptedTerms && <CheckCircle2 size={14} className="text-white" />}
                     </button>
                     <p className="text-[11px] text-gray-400 leading-tight">
                         Acepto los <span onClick={() => setShowTerms(true)} className="text-blue-400 font-bold hover:underline cursor-pointer">Términos de Servicio</span> y entiendo que soy legalmente responsable por el contenido que publique.
                     </p>
                 </div>

                 <button 
                    type="submit"
                    className={`w-full font-bold py-4 rounded-2xl text-xl transition-all shadow-xl active:scale-95 mt-2 ${acceptedTerms ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-blue-600/20' : 'bg-white/10 text-white border border-white/10'}`}
                 >
                     Empezar a Crear
                 </button>

                 <div className="relative flex items-center py-4">
                     <div className="flex-grow border-t border-white/10"></div>
                     <span className="flex-shrink mx-4 text-gray-500 text-xs font-bold uppercase tracking-widest">O</span>
                     <div className="flex-grow border-t border-white/10"></div>
                 </div>

                 <button 
                    type="button"
                    onClick={() => {
                        if (acceptedTerms) {
                            onGoogleLogin();
                        } else {
                            setShowTerms(true);
                        }
                    }}
                    className={`w-full border font-bold py-4 rounded-2xl text-lg transition-all flex items-center justify-center gap-4 ${acceptedTerms ? 'bg-white/5 hover:bg-white/10 border-white/10 text-white' : 'bg-white/10 text-white border border-white/20'}`}
                 >
                     <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" referrerPolicy="no-referrer" />
                     Google Login
                 </button>
             </form>
         </div>
      </div>

      {showTerms && <TermsModal onClose={() => { setShowTerms(false); setAcceptedTerms(true); }} />}

      <footer className="w-full text-center p-8 text-xs text-gray-500 z-10 flex flex-col items-center gap-4">
         <div className="flex gap-8 font-bold uppercase tracking-widest opacity-40">
            <span className="hover:text-white cursor-pointer transition-colors">Términos</span>
            <span className="hover:text-white cursor-pointer transition-colors">Privacidad</span>
            <span className="hover:text-white cursor-pointer transition-colors">Soporte</span>
         </div>
         <p className="font-medium tracking-[0.3em] uppercase opacity-30">© 2026 Glidrovia Studios • Powered by Sockets</p>
      </footer>
    </div>
  );
};