import React, { useState } from 'react';
import { Flag, X, AlertTriangle, ShieldAlert } from 'lucide-react';
import { dataService } from '../lib/dataService';

interface ReportModalProps {
  targetId: string;
  targetType: 'game' | 'user' | 'item' | 'comment';
  targetName: string;
  reporterUid: string;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ targetId, targetType, targetName, reporterUid, onClose }) => {
  const [reason, setReason] = useState<'copyright' | 'harassment' | 'offensive' | 'scam' | 'other'>('copyright');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    try {
      await dataService.submitReport({
        reporterUid,
        targetId,
        targetType,
        reason,
        description,
      });
      setIsSuccess(true);
      setTimeout(onClose, 2000);
    } catch (err) {
      console.error("Error submitting report:", err);
      alert("Error al enviar el reporte. Por favor, intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1b1e] border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-red-600/5">
          <div className="flex items-center gap-3">
            <Flag className="text-red-400" size={20} />
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Reportar Contenido</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20">
              <ShieldAlert className="text-green-400" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Reporte Enviado</h3>
            <p className="text-gray-400 text-sm">Gracias por ayudarnos a mantener la comunidad segura. Revisaremos tu reporte pronto.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex gap-3 text-red-400">
               <AlertTriangle size={24} className="shrink-0" />
               <p className="text-xs leading-relaxed">
                  Estás reportando: <span className="font-bold">{targetName}</span> ({targetType}). 
                  Las denuncias falsas pueden resultar en el baneo de tu cuenta.
               </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Motivo del Reporte</label>
              <select 
                value={reason}
                onChange={(e: any) => setReason(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500 transition-all"
              >
                <option value="copyright">Infracción de Derechos de Autor (DMCA)</option>
                <option value="harassment">Acoso o Bullying</option>
                <option value="offensive">Contenido Ofensivo / Inapropiado</option>
                <option value="scam">Estafa o Spam</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Descripción / Evidencia</label>
              <textarea 
                placeholder="Por favor, explica detalladamente el problema..."
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white h-32 focus:outline-none focus:border-red-500 transition-all resize-none placeholder-white/10"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-red-900/20 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? "Enviando..." : "Enviar Reporte"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
