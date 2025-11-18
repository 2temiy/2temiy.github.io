import React, { useState, useEffect } from 'react';
import MonacoEditor from './components/MonacoEditor';
import AIPanel from './components/AIPanel';
import { ScriptTab } from './types';
import { 
  Play, 
  Plus, 
  X, 
  Sparkles, 
  Trash2,
  Save,
  Terminal,
  MessageSquare,
  Cpu
} from 'lucide-react';

const DEFAULT_SCRIPT = `-- Nebula v3 [Minimalist]
-- Right-click code to access AI features (Explain, Fix, Optimize)

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

print("Nebula Injected. Welcome " .. LocalPlayer.Name)
`;

function App() {
  const [tabs, setTabs] = useState<ScriptTab[]>([
    { id: '1', title: 'Main.lua', content: DEFAULT_SCRIPT }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('1');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  
  // AI Trigger State
  const [aiTrigger, setAiTrigger] = useState<{ type: 'EXPLAIN' | 'FIX' | 'OPTIMIZE' | 'CHAT', code: string } | null>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const createTab = () => {
    const newId = Date.now().toString();
    const newTab: ScriptTab = {
      id: newId,
      title: `Script ${tabs.length + 1}.lua`,
      content: ''
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; 
    
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const updateTabContent = (newContent: string | undefined) => {
    if (newContent === undefined) return;
    setTabs(tabs.map(t => t.id === activeTabId ? { ...t, content: newContent } : t));
  };

  const handleExecute = () => {
    setIsExecuting(true);
    setStatusText("Injecting & Executing...");
    setTimeout(() => {
      setIsExecuting(false);
      setStatusText("Execution Complete");
      setTimeout(() => setStatusText("Ready"), 2000);
    }, 600);
  };

  const handleAiAction = (type: 'EXPLAIN' | 'FIX' | 'OPTIMIZE', code: string) => {
    setShowAiPanel(true);
    setAiTrigger({ type, code });
  };

  const handleSave = (format: 'lua' | 'txt') => {
    const blob = new Blob([activeTab.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Remove existing extension to avoid script.lua.txt
    const baseName = activeTab.title.replace(/\.[^/.]+$/, "");
    link.download = `${baseName}.${format}`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowSaveMenu(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-400 overflow-hidden font-sans selection:bg-purple-500/30">
      
      {/* Minimalist Top Bar */}
      <div className="h-9 flex items-center bg-[#09090b] border-b border-zinc-800/50 select-none">
        
        {/* Tabs Container */}
        <div className="flex-1 flex items-center overflow-x-auto scrollbar-none px-2 gap-1">
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`
                group relative h-7 flex items-center min-w-[100px] max-w-[180px] px-3 rounded-md text-[11px] cursor-pointer transition-all border border-transparent
                ${activeTabId === tab.id 
                  ? 'bg-zinc-800 text-zinc-100 border-zinc-700/50 shadow-sm' 
                  : 'hover:bg-zinc-800/50 hover:text-zinc-300'
                }
              `}
            >
              <Cpu className={`w-3 h-3 mr-2 ${activeTabId === tab.id ? 'text-purple-400' : 'text-zinc-600'}`} />
              <span className="truncate flex-1">{tab.title}</span>
              <button 
                onClick={(e) => closeTab(tab.id, e)}
                className={`ml-2 p-0.5 rounded hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity ${tabs.length === 1 ? 'hidden' : ''}`}
              >
                 <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button 
            onClick={createTab}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Minimal Toolbar */}
        <div className="flex items-center px-3 gap-1 border-l border-zinc-800/50 h-5 my-auto">
          <button 
             onClick={handleExecute}
             className="flex items-center gap-2 px-3 py-1 rounded hover:bg-purple-900/20 text-purple-400 hover:text-purple-300 transition-colors text-xs font-medium"
          >
             <Play className="w-3 h-3 fill-current" />
             <span>Run</span>
          </button>
          
          <div className="w-[1px] h-3 bg-zinc-800 mx-2"></div>

          <button onClick={() => updateTabContent('')} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300" title="Clear">
             <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="relative">
            <button 
              onClick={() => setShowSaveMenu(!showSaveMenu)}
              className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${showSaveMenu ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Save As..."
            >
               <Save className="w-3.5 h-3.5" />
            </button>
            
            {showSaveMenu && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSaveMenu(false)}></div>
                    <div className="absolute top-full mt-2 right-0 w-32 bg-[#0a0a0c] border border-zinc-800 rounded-lg shadow-2xl py-1 z-20 flex flex-col overflow-hidden ring-1 ring-black/20">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Save as</div>
                        <button 
                            onClick={() => handleSave('lua')}
                            className="text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-purple-500/10 hover:text-purple-300 transition-colors flex items-center gap-2"
                        >
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50"></span>
                           .lua
                        </button>
                        <button 
                            onClick={() => handleSave('txt')}
                            className="text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-purple-500/10 hover:text-purple-300 transition-colors flex items-center gap-2"
                        >
                           <span className="w-1.5 h-1.5 rounded-full bg-zinc-500/50"></span>
                           .txt
                        </button>
                    </div>
                </>
            )}
          </div>
          
          <div className="w-[1px] h-3 bg-zinc-800 mx-2"></div>

          <button 
            onClick={() => setShowAiPanel(!showAiPanel)}
            className={`flex items-center gap-2 px-3 py-1 rounded transition-colors text-xs font-medium ${showAiPanel ? 'bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-800/50 text-zinc-500'}`}
          >
             <Sparkles className="w-3.5 h-3.5" />
             <span>AI</span>
          </button>
        </div>
      </div>

      {/* Main Content: Editor + Overlay */}
      <div className="flex-1 relative flex overflow-hidden bg-[#09090b]">
          
          {/* Editor Layer */}
          <div className="flex-1 min-w-0 h-full">
             <MonacoEditor 
                value={activeTab.content} 
                onChange={updateTabContent}
                onAiAction={handleAiAction}
             />
          </div>

          {/* AI Sliding Panel (Overlay style) */}
          <div 
             className={`
                absolute top-0 right-0 bottom-0 w-[450px] bg-[#0a0a0c]/95 backdrop-blur-xl border-l border-zinc-800/50 shadow-2xl transform transition-transform duration-300 ease-in-out z-20
                ${showAiPanel ? 'translate-x-0' : 'translate-x-full'}
             `}
          >
             <AIPanel 
                currentCode={activeTab.content} 
                onApplyCode={(code) => updateTabContent(code)}
                onClose={() => setShowAiPanel(false)}
                activeTrigger={aiTrigger}
                onTriggerHandled={() => setAiTrigger(null)}
             />
          </div>
      </div>

      {/* Ultra-thin Status Bar */}
      <div className="h-6 bg-[#09090b] border-t border-zinc-900 flex items-center px-3 justify-between text-[10px] text-zinc-600 select-none">
         <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${isExecuting ? 'bg-purple-500 animate-pulse' : 'bg-green-500/50'}`}></div>
               <span>{statusText}</span>
            </div>
            <span>Ln 1, Col 1</span>
            <span>UTF-8</span>
         </div>
         <div className="flex items-center gap-3">
            <span>Nebula Engine v2.5</span>
            <span className="hover:text-zinc-400 cursor-pointer">Logs</span>
         </div>
      </div>

    </div>
  );
}

export default App;