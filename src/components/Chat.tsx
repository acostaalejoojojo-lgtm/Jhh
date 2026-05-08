import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface ChatProps {
    socket: Socket | null;
    roomId: string;
    username: string;
    supabaseChannel?: any;
}

export const Chat: React.FC<ChatProps> = ({ socket, roomId, username, supabaseChannel }) => {
    const [messages, setMessages] = useState<{user: string, text: string}[]>([]);
    const [input, setInput] = useState("");

    useEffect(() => {
        // Socket.io Listener (Fallback)
        if (socket) {
            socket.on("chat-message", (data: {user: string, text: string}) => {
                setMessages(prev => [...prev.slice(-49), data]);
            });
        }

        // Supabase Listener (Primary for performance)
        if (supabaseChannel) {
            const sub = supabaseChannel.on('broadcast', { event: 'chat-message' }, ({ payload }: any) => {
                setMessages(prev => {
                    // Avoid duplicates if both are connected
                    if (prev.some(m => m.user === payload.user && m.text === payload.text)) return prev;
                    return [...prev.slice(-49), payload];
                });
            });
            // Note: supabase sub is part of channel, subscription handled in parent
        }

        return () => {
            if (socket) socket.off("chat-message");
        };
    }, [socket, supabaseChannel]);

    const sendMessage = () => {
        if (input.trim()) {
            const lowerInput = input.trim().toLowerCase();
            if (lowerInput === 'microphone-on' || lowerInput === 'microphone-off') {
                window.dispatchEvent(new CustomEvent('chat-command', { detail: { command: lowerInput } }));
                setMessages(prev => [...prev.slice(-49), { user: 'Sistema', text: `Ejecutando comando de voz...` }]);
                setInput("");
                return;
            }

            if (input.startsWith('/mic ')) {
                window.dispatchEvent(new CustomEvent('chat-command', { detail: { command: input.trim() } }));
                setMessages(prev => [...prev.slice(-49), { user: 'Sistema', text: `Comando ejecutado: ${input}` }]);
                setInput("");
                return;
            }

            const msgData = { user: username, text: input };

            // Send via All available channels
            if (supabaseChannel) {
                supabaseChannel.send({
                    type: 'broadcast',
                    event: 'chat-message',
                    payload: msgData
                });
                // Local view
                setMessages(prev => [...prev.slice(-49), msgData]);
            } else if (socket) {
                socket.emit("chat-message", roomId, msgData);
            }
            
            setInput("");
        }
    };

    return (
        <div className="absolute bottom-40 left-4 w-64 h-48 bg-black/50 backdrop-blur-md rounded-lg p-2 flex flex-col z-50 border border-white/10 shadow-2xl">
            <div className="flex-1 overflow-y-auto text-xs text-white space-y-1 mb-2 scrollbar-hide">
                {messages.map((m, i) => (
                    <div key={i} className={`${m.user === 'Sistema' ? 'text-yellow-400 italic' : ''}`}>
                        <strong className={m.user === username ? 'text-blue-400' : 'text-green-400'}>{m.user}:</strong> {m.text}
                    </div>
                ))}
            </div>
            <div className="flex gap-1">
                <input 
                    className="flex-1 bg-white/10 text-white text-xs p-1 rounded"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                />
                <button onClick={sendMessage} className="bg-blue-600 p-1 rounded"><Send size={12} /></button>
            </div>
        </div>
    );
};
