import React from 'react';
import { Shield, X } from 'lucide-react';

interface TermsModalProps {
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1b1e] border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#2563eb]/5">
          <div className="flex items-center gap-3">
            <Shield className="text-blue-400" size={24} />
            <h2 className="text-xl font-black text-white uppercase tracking-tight italic">Términos de Servicio (ToS)</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto space-y-6 text-gray-300 text-sm leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <section>
            <h3 className="text-blue-400 font-black uppercase text-xs mb-3 tracking-widest">1. Puerto Seguro y Responsabilidad</h3>
            <p>
              Glidrovia opera como una plataforma de contenido generado por usuarios (UGC). Al utilizar nuestros servicios, usted acepta que es el único responsable de cualquier contenido (mapas, modelos, sonidos, imágenes, etc.) que publique o suba a la plataforma.
            </p>
          </section>

          <section>
            <h3 className="text-blue-400 font-black uppercase text-xs mb-3 tracking-widest">2. Propiedad Intelectual y DMCA</h3>
            <p>
              Está estrictamente prohibido subir contenido que viole los derechos de autor, marcas registradas o cualquier otro derecho de propiedad intelectual de terceros. Glidrovia se reserva el derecho de eliminar cualquier contenido que sea objeto de una notificación de infracción válida (DMCA) sin previo aviso.
            </p>
            </section>

          <section>
            <h3 className="text-blue-400 font-black uppercase text-xs mb-3 tracking-widest">3. Conducta del Usuario</h3>
            <p>
              Usted acepta no utilizar la plataforma para publicar contenido ofensivo, acosador, ilegal o que viole las leyes locales o internacionales. El incumplimiento de estas normas resultará en el baneo permanente de su cuenta.
            </p>
          </section>

          <section>
            <h3 className="text-blue-400 font-black uppercase text-xs mb-3 tracking-widest">4. Indemnización</h3>
            <p>
              Usted acepta indemnizar y eximir de responsabilidad a Glidrovia y sus propietarios por cualquier reclamo legal, pérdida o daño resultante de su uso indebido de la plataforma o del contenido que publique.
            </p>
          </section>

          <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl italic text-xs text-blue-400 text-center">
            "Al usar Glidrovia, aceptas que eres el creador y responsable legal de tus experiencias."
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-black/40 flex justify-center">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/40 active:scale-95"
          >
            Entendido y Acepto
          </button>
        </div>
      </div>
    </div>
  );
};
