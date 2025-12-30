import { useState, useEffect, useRef, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { 
  FileText, Upload, Search, MessageSquare, Trash2, 
  Loader2, CheckCircle2, Send, BookOpen, Zap, Eye,
  AlertTriangle, CheckCheck, Brain, FileSearch, ChevronDown, Sparkles,
  Gauge, Turtle, Rabbit, Clock, History, Settings, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Simplified Model Options
const AI_MODELS = [
  {
    id: "gemini-1.5-pro",
    name: "Deep Analysis (Best)",
    provider: "Google",
    badge: "RECOMMENDED",
    badgeColor: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30",
    description: "Reads every word of native PDFs. Best for contracts and complex queries.",
    speed: "Medium",
    accuracy: "Highest"
  },
  {
    id: "gemini-2.5-pro",
    name: "Standard Analysis",
    provider: "Google",
    badge: "FAST",
    badgeColor: "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30",
    description: "Faster processing for general purpose documents.",
    speed: "Fast",
    accuracy: "High"
  }
];

// Speed options
const SPEED_OPTIONS = [
  {
    id: "thorough",
    name: "Thorough",
    icon: Turtle,
    description: "Meticulous read",
    color: "text-[#10B981]"
  },
  {
    id: "balanced",
    name: "Balanced",
    icon: Gauge,
    description: "Recommended",
    color: "text-[#3B82F6]"
  },
  {
    id: "fast",
    name: "Fast",
    icon: Rabbit,
    description: "Quick scan",
    color: "text-[#F59E0B]"
  }
];

// Advanced Settings Component
const AdvancedSettings = ({ 
  selectedModel, onModelChange, 
  selectedSpeed, onSpeedChange,
  pageRange, onPageRangeChange, pageRangeEnabled, onPageRangeEnabledChange,
  totalPages 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="doc-card border border-[#27272a] bg-[#121214]">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-2">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#a1a1aa]" />
          <span className="text-sm font-medium text-[#a1a1aa]">Scanner Settings</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-[#a1a1aa]" /> : <ChevronDown className="w-4 h-4 text-[#a1a1aa]" />}
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-2">
        {/* Model Selector */}
        <div>
          <Label className="text-xs text-[#52525b] mb-1 block">Analysis Model</Label>
          <Select value={selectedModel} onValueChange={onModelChange}>
            <SelectTrigger className="w-full bg-[#09090b] border-[#27272a] text-[#fafafa] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#121214] border-[#27272a]">
              {AI_MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-[#fafafa] focus:bg-[#1c1c1f]">
                  <div className="flex items-center gap-2">
                    <span>{model.name}</span>
                    {model.badge && <Badge className={`text-[10px] ${model.badgeColor}`}>{model.badge}</Badge>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Speed Selector */}
        <div>
          <Label className="text-xs text-[#52525b] mb-1 block">Scan Speed</Label>
          <div className="grid grid-cols-3 gap-2">
            {SPEED_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedSpeed === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => onSpeedChange(option.id)}
                  className={`p-2 rounded border text-center transition-all ${
                    isSelected 
                      ? 'border-[#F59E0B] bg-[#F59E0B]/5' 
                      : 'border-[#27272a] bg-[#09090b] hover:border-[#52525b]'
                  }`}
                >
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? 'text-[#F59E0B]' : option.color}`} />
                  <span className={`text-[10px] font-medium ${isSelected ? 'text-[#F59E0B]' : 'text-[#a1a1aa]'}`}>
                    {option.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Page Range */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-[#52525b]">Page Range Limit</Label>
            <Switch
              checked={pageRangeEnabled}
              onCheckedChange={onPageRangeEnabledChange}
              className="scale-75"
            />
          </div>
          
          {pageRangeEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Start"
                value={pageRange.start || ''}
                onChange={(e) => onPageRangeChange({ ...pageRange, start: e.target.value ? parseInt(e.target.value) : null })}
                className="h-8 text-xs bg-[#09090b] border-[#27272a]"
              />
              <Input
                type="number"
                placeholder="End"
                value={pageRange.end || ''}
                onChange={(e) => onPageRangeChange({ ...pageRange, end: e.target.value ? parseInt(e.target.value) : null })}
                className="h-8 text-xs bg-[#09090b] border-[#27272a]"
              />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// Upload Component
const DocumentUpload = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const uploadFiles = useCallback(async (files) => {
    setUploading(true);
    // Use the Pro Upload flow directly for better quality
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast.error(`${file.name} is not a PDF`);
        continue;
      }
      
      try {
        // Step 1: Init
        const init = await axios.post(`${API}/pro/upload/init`, {
          filename: file.name,
          size_bytes: file.size,
        });
        const uploadId = init.data.upload_id;

        // Step 2: Chunk upload
        const chunkSize = 5 * 1024 * 1024; // 5MB
        let offset = 0;
        while (offset < file.size) {
          const end = Math.min(offset + chunkSize, file.size);
          const blob = file.slice(offset, end);
          await fetch(`${API}/pro/upload/${uploadId}/chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: blob,
          });
          offset = end;
        }

        // Step 3: Complete
        await axios.post(`${API}/pro/upload/complete`, {
          upload_id: uploadId,
          gemini_api_key: "SERVER_ENV_KEY",
        });

        toast.success(`Processed: ${file.name}`);
        onUploadSuccess?.();
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
  }, [onUploadSuccess]);

  return (
    <div
      className="upload-zone border-2 border-dashed border-[#27272a] hover:border-[#F59E0B] hover:bg-[#F59E0B]/5 rounded-lg p-6 text-center cursor-pointer transition-all"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
      }}
    >
      <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={(e) => e.target.files?.length && uploadFiles(e.target.files)} className="hidden" />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 text-[#F59E0B] animate-spin" />
          <span className="text-sm text-[#a1a1aa]">Processing...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-8 h-8 text-[#a1a1aa]" />
          <div>
            <p className="text-[#fafafa] font-medium text-sm">Upload Documents</p>
            <p className="text-[#52525b] text-xs">PDF files supported</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Document Card
const DocumentCard = ({ doc, selected, onSelect, onDelete }) => (
  <div className={`doc-card p-3 rounded-md border cursor-pointer transition-all ${selected ? 'border-[#F59E0B] bg-[#F59E0B]/5' : 'border-[#27272a] bg-[#121214] hover:border-[#52525b]'}`} onClick={() => onSelect(doc.id)}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 overflow-hidden">
        <FileText className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-[#F59E0B]' : 'text-[#a1a1aa]'}`} />
        <div className="min-w-0">
          <p className="text-[#fafafa] text-sm font-medium truncate">{doc.filename}</p>
          <p className="text-xs text-[#52525b]">{doc.total_pages || '?'} pages</p>
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }} className="p-1 hover:bg-[#27272a] rounded text-[#52525b] hover:text-[#EF4444]">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  </div>
);

// Finding Card
const FindingCard = ({ finding }) => {
  const pageNum = finding.page_number || finding.global_page;
  const text = finding.text || finding.quote;
  
  return (
    <div className="bg-[#121214] border border-[#27272a] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Badge className="bg-[#27272a] text-[#a1a1aa] hover:bg-[#27272a]">Page {pageNum}</Badge>
        {finding.confidence && (
          <span className={`text-[10px] uppercase font-bold tracking-wider ${
            finding.confidence === 'high' ? 'text-[#10B981]' : 
            finding.confidence === 'low' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
          }`}>
            {finding.confidence} Confidence
          </span>
        )}
      </div>
      <blockquote className="text-sm text-[#d4d4d8] border-l-2 border-[#F59E0B] pl-3 py-1 italic">
        "{text}"
      </blockquote>
      {finding.relevance && (
        <p className="text-xs text-[#a1a1aa] mt-2">
          <span className="text-[#52525b] font-medium">Analysis:</span> {finding.relevance}
        </p>
      )}
    </div>
  );
};

// Chat Panel
const ChatPanel = ({ documents }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !documents.length) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      // Use Pro Chat for best results
      const res = await axios.post(`${API}/pro/chat`, {
        session_id: sessionId,
        pro_document_id: documents[0].id, // Currently chatting with single doc context primarily
        message: userMsg,
        gemini_api_key: "SERVER_ENV_KEY",
      });
      
      if (!sessionId) setSessionId(res.data.session_id);
      setMessages(prev => [...prev, { role: "assistant", content: res.data.answer }]);
    } catch (err) {
      toast.error("Chat failed");
      setMessages(prev => prev.slice(0, -1));
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 opacity-50">
            <MessageSquare className="w-12 h-12 mb-4" />
            <p className="text-sm">Chat with your documents</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-[#F59E0B] text-black font-medium' 
                    : 'bg-[#27272a] text-[#fafafa]'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#27272a] rounded-lg p-3">
                  <Loader2 className="w-4 h-4 animate-spin text-[#F59E0B]" />
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <div className="p-4 border-t border-[#27272a]">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask a question..."
            disabled={loading || !documents.length}
            className="bg-[#121214] border-[#27272a] text-[#fafafa]"
          />
          <Button onClick={sendMessage} disabled={loading || !documents.length} className="bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-black">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Main Component
const DeepDive = () => {
  const [documents, setProDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [activeTab, setActiveTab] = useState("results");
  const [query, setQuery] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, status: '' });
  
  // Settings
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-pro");
  const [selectedSpeed, setSelectedSpeed] = useState("balanced");
  const [pageRangeEnabled, setPageRangeEnabled] = useState(false);
  const [pageRange, setPageRange] = useState({ start: null, end: null });
  const [history, setHistory] = useState([]); // Store analysis history

  const loadDocuments = async () => {
    try {
      const res = await axios.get(`${API}/pro/documents`);
      setProDocuments(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await axios.get(`${API}/pro/analyses`);
      setHistory(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadHistory();
  }, []);

  // Restore latest analysis when a document is selected
  useEffect(() => {
    if (selectedDocs.length === 1 && !analyzing) {
      const docId = selectedDocs[0];
      // Find the most recent analysis for this document
      const lastAnalysis = history.find(h => h.pro_document_id === docId && h.status === 'complete');
      
      if (lastAnalysis && lastAnalysis.result) {
        setAnalysisResult(lastAnalysis.result);
        setQuery(lastAnalysis.query || "");
        toast.info("Restored previous analysis", { duration: 2000 });
      } else {
        setAnalysisResult(null);
        setQuery("");
      }
    }
  }, [selectedDocs, history, analyzing]);

  const toggleDoc = (id) => {
    setSelectedDocs(prev => prev.includes(id) ? [] : [id]);
  };

  const deleteDoc = async (id) => {
    try {
      await axios.delete(`${API}/pro/documents/${id}?gemini_api_key=SERVER_ENV_KEY`);
      loadDocuments();
      setSelectedDocs(prev => prev.filter(d => d !== id));
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const runAnalysis = async () => {
    if (!selectedDocs.length || !query.trim()) return;
    
    setAnalyzing(true);
    setAnalysisResult(null);
    setProgress({ percent: 5, status: 'Initializing...' });

    try {
      const response = await fetch(`${API}/pro/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_document_id: selectedDocs[0],
          query,
          gemini_api_key: "SERVER_ENV_KEY",
          deep_dive: true,
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'batch_start' || data.type === 'progress') {
              setProgress({ percent: 50, status: 'Analyzing document content...' });
            }
            if (data.type === 'done') {
              setAnalysisResult(data.result);
              setProgress({ percent: 100, status: 'Complete' });
              setAnalyzing(false);
              loadHistory(); // Refresh history after new analysis
            }
            if (data.type === 'error') {
              toast.error(data.message);
              setAnalyzing(false);
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      toast.error("Analysis failed");
      setAnalyzing(false);
    }
  };

  const selectedDocumentObjects = documents.filter(d => selectedDocs.includes(d.id));

  return (
    <div className="h-screen bg-[#09090b] flex flex-col">
      <header className="h-14 border-b border-[#27272a] bg-[#121214] flex items-center px-6">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#F59E0B]" />
          <h1 className="font-bold text-[#fafafa]">Document Deep Dive</h1>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Sidebar Controls */}
        <div className="col-span-4 border-r border-[#27272a] p-4 flex flex-col gap-4 overflow-y-auto bg-[#0c0c0e]">
          <DocumentUpload onUploadSuccess={loadDocuments} />
          
          <div className="flex-1">
            <h3 className="text-xs font-bold text-[#52525b] uppercase tracking-wider mb-2">Documents</h3>
            {documents.length === 0 ? (
              <p className="text-xs text-[#52525b] italic">No documents available</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <DocumentCard 
                    key={doc.id} 
                    doc={doc} 
                    selected={selectedDocs.includes(doc.id)} 
                    onSelect={toggleDoc} 
                    onDelete={deleteDoc} 
                  />
                ))}
              </div>
            )}
          </div>

          <AdvancedSettings 
            selectedModel={selectedModel} onModelChange={setSelectedModel}
            selectedSpeed={selectedSpeed} onSpeedChange={setSelectedSpeed}
            pageRange={pageRange} onPageRangeChange={setPageRange}
            pageRangeEnabled={pageRangeEnabled} onPageRangeEnabledChange={setPageRangeEnabled}
          />

          <div className="bg-[#121214] p-4 rounded-lg border border-[#27272a]">
            <Label className="text-xs text-[#a1a1aa] mb-2 block">Search Query</Label>
            <Textarea 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What specific information are you looking for?"
              className="bg-[#09090b] border-[#27272a] min-h-[100px] mb-3 text-sm"
            />
            <Button 
              onClick={runAnalysis} 
              disabled={!selectedDocs.length || !query.trim() || analyzing}
              className="w-full bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-black font-bold"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
              {analyzing ? 'Scanning...' : 'Start Deep Scan'}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="col-span-8 bg-[#09090b] flex flex-col h-full overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <div className="border-b border-[#27272a] px-4 pt-2 flex-none">
              <TabsList className="bg-transparent">
                <TabsTrigger value="results" className="data-[state=active]:border-b-2 data-[state=active]:border-[#F59E0B] rounded-none px-6">Results</TabsTrigger>
                <TabsTrigger value="chat" className="data-[state=active]:border-b-2 data-[state=active]:border-[#F59E0B] rounded-none px-6">Chat</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 relative">
              <TabsContent value="results" className="absolute inset-0 overflow-y-auto p-4 m-0">
                {analyzing ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-12 h-12 text-[#F59E0B] animate-spin" />
                    <div className="text-center">
                      <h3 className="text-lg font-medium text-[#fafafa]">Analyzing Document...</h3>
                      <p className="text-[#a1a1aa] text-sm mt-1">{progress.status}</p>
                    </div>
                    <Progress value={progress.percent} className="w-[300px] h-2" />
                  </div>
                ) : analysisResult ? (
                  <div className="space-y-6 max-w-3xl mx-auto pb-10">
                    <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg p-4">
                      <h3 className="font-bold text-[#F59E0B] mb-1">Analysis Complete</h3>
                      <p className="text-sm text-[#fafafa] opacity-80">
                        {analysisResult.findings?.length || 0} findings based on query: "{query}"
                      </p>
                    </div>

                    {analysisResult.notes && (
                      <div className="bg-[#121214] border border-[#27272a] rounded-lg p-4">
                        <h4 className="text-sm font-medium text-[#a1a1aa] mb-2 uppercase tracking-wide">Summary Notes</h4>
                        <p className="text-[#fafafa] leading-relaxed">{analysisResult.notes}</p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <h4 className="text-sm font-medium text-[#a1a1aa] uppercase tracking-wide">Key Findings</h4>
                      {analysisResult.findings?.map((f, i) => (
                        <FindingCard key={i} finding={f} />
                      ))}
                      {(!analysisResult.findings || analysisResult.findings.length === 0) && (
                        <p className="text-center text-[#52525b] py-8">No specific quotes found matching the criteria.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                    <Search className="w-16 h-16 mb-4 text-[#a1a1aa]" />
                    <p className="text-[#fafafa] text-lg">Ready to analyze</p>
                    <p className="text-[#52525b] text-sm">Select a document and run a scan</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="chat" className="h-full m-0">
                <ChatPanel documents={selectedDocumentObjects} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default DeepDive;
