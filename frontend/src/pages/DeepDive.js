import { useState, useEffect, useRef, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { 
  FileText, Upload, Search, MessageSquare, Trash2, 
  Loader2, CheckCircle2, Send, BookOpen, Zap, Eye,
  AlertTriangle, CheckCheck, Brain, FileSearch, ChevronDown, Sparkles,
  Gauge, Turtle, Rabbit, Clock, History
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


// Gemini Pro (native PDF) settings
const GEMINI_KEY_STORAGE = "gemini_api_key";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// AI Model options with descriptions
const AI_MODELS = [
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "Google",
    badge: "PRO ONLY",
    badgeColor: "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30",
    description: "Native PDF reading + long-context reasoning for deep contract inspection.",
    speed: "Medium",
    cost: "$$",
    accuracy: "Highest"
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    badge: "PRO FALLBACK",
    badgeColor: "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30",
    description: "Fallback if Gemini 1.5 Pro is unavailable. Still Pro (never Flash).",
    speed: "Medium",
    cost: "$$",
    accuracy: "Highest"
  }
];

// Speed options
const SPEED_OPTIONS = [
  {
    id: "thorough",
    name: "Thorough",
    icon: Turtle,
    pagesPerBatch: 10,
    description: "Reads every word carefully. Best for finding subtle details.",
    timeEstimate: "~35-40 min / 1000 pages",
    accuracy: "Best",
    color: "text-[#10B981]"
  },
  {
    id: "balanced",
    name: "Balanced",
    icon: Gauge,
    pagesPerBatch: 20,
    description: "Good accuracy with faster speed. Recommended for most searches.",
    timeEstimate: "~15-20 min / 1000 pages",
    accuracy: "Good",
    color: "text-[#3B82F6]"
  },
  {
    id: "fast",
    name: "Fast",
    icon: Rabbit,
    pagesPerBatch: 30,
    description: "Quick scan for keyword searches. May miss subtle details.",
    timeEstimate: "~10-12 min / 1000 pages",
    accuracy: "Decent",
    color: "text-[#F59E0B]"
  }
];

// Speed Selector Component
const SpeedSelector = ({ selectedSpeed, onSpeedChange, totalPages }) => {
  const selected = SPEED_OPTIONS.find(s => s.id === selectedSpeed) || SPEED_OPTIONS[1];
  const IconComponent = selected.icon;
  
  // Calculate estimated time for current document
  const estimateTime = (speed, pages) => {
    const opt = SPEED_OPTIONS.find(s => s.id === speed);
    if (!pages || !opt) return "Select documents";
    const batches = Math.ceil(pages / opt.pagesPerBatch);
    const minTime = Math.ceil(batches * 0.15); // ~9 sec per batch minimum
    const maxTime = Math.ceil(batches * 0.25); // ~15 sec per batch maximum
    if (minTime < 1) return "< 1 min";
    if (minTime === maxTime) return `~${minTime} min`;
    return `~${minTime}-${maxTime} min`;
  };

  return (
    <div className="doc-card">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className="w-4 h-4 text-[#3B82F6]" />
        <span className="overline">Scan Speed</span>
        {totalPages > 0 && (
          <span className="ml-auto text-xs text-[#a1a1aa]">Est: <span className="text-[#F59E0B] font-medium">{estimateTime(selectedSpeed, totalPages)}</span></span>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {SPEED_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedSpeed === option.id;
          return (
            <button
              key={option.id}
              onClick={() => onSpeedChange(option.id)}
              data-testid={`speed-${option.id}`}
              className={`p-3 rounded border text-left transition-all ${
                isSelected 
                  ? 'border-[#F59E0B] bg-[#F59E0B]/5' 
                  : 'border-[#27272a] bg-[#09090b] hover:border-[#52525b]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${isSelected ? 'text-[#F59E0B]' : option.color}`} />
                <span className={`text-sm font-medium ${isSelected ? 'text-[#F59E0B]' : 'text-[#fafafa]'}`}>
                  {option.name}
                </span>
              </div>
              <p className="text-[10px] text-[#a1a1aa] leading-tight">{option.description}</p>
            </button>
          );
        })}
      </div>
      
      <div className="mt-3 flex items-center justify-between text-xs text-[#52525b]">
        <span>Accuracy: <span className={selected.color}>{selected.accuracy}</span></span>
        <span>{selected.pagesPerBatch} pages/batch</span>
      </div>
    </div>
  );
};

// Page Range Selector Component
const PageRangeSelector = ({ pageRange, onPageRangeChange, totalPages, enabled, onEnabledChange }) => {
  return (
    <div className="doc-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#8B5CF6]" />
          <span className="overline">Page Range</span>
        </div>
        <button
          onClick={() => onEnabledChange(!enabled)}
          data-testid="page-range-toggle"
          className={`text-xs px-2 py-1 rounded transition-all ${
            enabled 
              ? 'bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/30' 
              : 'bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa]'
          }`}
        >
          {enabled ? 'Enabled' : 'Scan All'}
        </button>
      </div>
      
      {enabled ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#52525b] block mb-1">Start Page</label>
              <Input
                type="number"
                min={1}
                max={totalPages || 9999}
                value={pageRange.start || ''}
                onChange={(e) => onPageRangeChange({ ...pageRange, start: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="1"
                data-testid="page-start-input"
                className="bg-[#09090b] border-[#27272a] text-[#fafafa] text-sm h-9"
              />
            </div>
            <div>
              <label className="text-xs text-[#52525b] block mb-1">End Page</label>
              <Input
                type="number"
                min={pageRange.start || 1}
                max={totalPages || 9999}
                value={pageRange.end || ''}
                onChange={(e) => onPageRangeChange({ ...pageRange, end: e.target.value ? parseInt(e.target.value) : null })}
                placeholder={totalPages || 'End'}
                data-testid="page-end-input"
                className="bg-[#09090b] border-[#27272a] text-[#fafafa] text-sm h-9"
              />
            </div>
          </div>
          
          <p className="text-xs text-[#a1a1aa]">
            Scanning pages <span className="text-[#8B5CF6] font-medium">{pageRange.start || 1}</span> to <span className="text-[#8B5CF6] font-medium">{pageRange.end || totalPages || '?'}</span>
            {totalPages > 0 && (
              <span className="text-[#52525b]"> ({(pageRange.end || totalPages) - (pageRange.start || 1) + 1} pages)</span>
            )}
          </p>
          
          {/* Quick select buttons */}
          {totalPages > 100 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[#52525b]">Quick:</span>
              <button 
                onClick={() => onPageRangeChange({ start: 1, end: 50 })}
                className="text-xs px-2 py-0.5 bg-[#27272a] hover:bg-[#3f3f46] rounded text-[#a1a1aa]"
              >
                First 50
              </button>
              <button 
                onClick={() => onPageRangeChange({ start: 1, end: 100 })}
                className="text-xs px-2 py-0.5 bg-[#27272a] hover:bg-[#3f3f46] rounded text-[#a1a1aa]"
              >
                First 100
              </button>
              <button 
                onClick={() => onPageRangeChange({ start: Math.floor(totalPages / 2) - 50, end: Math.floor(totalPages / 2) + 50 })}
                className="text-xs px-2 py-0.5 bg-[#27272a] hover:bg-[#3f3f46] rounded text-[#a1a1aa]"
              >
                Middle 100
              </button>
              <button 
                onClick={() => onPageRangeChange({ start: totalPages - 99, end: totalPages })}
                className="text-xs px-2 py-0.5 bg-[#27272a] hover:bg-[#3f3f46] rounded text-[#a1a1aa]"
              >
                Last 100
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[#a1a1aa]">
          Will scan all <span className="text-[#fafafa] font-medium">{totalPages || 0}</span> pages. Click {"\"Enabled\""} to scan specific sections.
        </p>
      )}
    </div>
  );
};

// Model Selector Component
const ModelSelector = ({ selectedModel, onModelChange }) => {
  const selected = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];
  
  return (
    <div className="doc-card">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[#F59E0B]" />
        <span className="overline">AI Model</span>
      </div>
      
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="w-full bg-[#09090b] border-[#27272a] text-[#fafafa] h-auto py-3" data-testid="model-selector">
          <SelectValue>
            <div className="flex items-center gap-2 text-left">
              <span className="font-medium">{selected.name}</span>
              <span className="text-xs text-[#a1a1aa]">({selected.provider})</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-[#121214] border-[#27272a]">
          {AI_MODELS.map((model) => (
            <SelectItem 
              key={model.id} 
              value={model.id}
              className="text-[#fafafa] focus:bg-[#1c1c1f] focus:text-[#fafafa] cursor-pointer py-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-[#a1a1aa]">({model.provider})</span>
                  {model.badge && (
                    <Badge className={`text-[10px] ${model.badgeColor}`}>{model.badge}</Badge>
                  )}
                </div>
                <p className="text-xs text-[#a1a1aa] max-w-[300px]">{model.description}</p>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Selected model details */}
      <div className="mt-3 p-3 bg-[#09090b] rounded border border-[#27272a]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-[#fafafa]">{selected.name}</span>
          {selected.badge && (
            <Badge className={`text-[10px] ${selected.badgeColor}`}>{selected.badge}</Badge>
          )}
        </div>
        <p className="text-xs text-[#a1a1aa] mb-3">{selected.description}</p>
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-[#52525b]">Speed:</span>
            <span className="ml-1 text-[#a1a1aa]">{selected.speed}</span>
          </div>
          <div>
            <span className="text-[#52525b]">Cost:</span>
            <span className="ml-1 text-[#F59E0B]">{selected.cost}</span>
          </div>
          <div>
            <span className="text-[#52525b]">Accuracy:</span>
            <span className="ml-1 text-[#10B981]">{selected.accuracy}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Upload Component
const DocumentUpload = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const uploadFiles = useCallback(async (files) => {
    setUploading(true);
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast.error(`${file.name} is not a PDF`);
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await axios.post(`${API}/documents/upload`, formData);
        toast.success(`${file.name}: ${res.data.total_pages} pages, ${res.data.total_words.toLocaleString()} words`);
        onUploadSuccess?.();
      } catch (err) {
        toast.error(`Failed: ${file.name}`);
      }
    }
    setUploading(false);
  }, [onUploadSuccess]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) await uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  return (
    <div
      data-testid="upload-zone"
      className={`upload-zone ${isDragging ? 'dragover' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={(e) => e.target.files?.length && uploadFiles(e.target.files)} className="hidden" data-testid="file-input" />
      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-[#F59E0B] animate-spin" />
          <span className="text-[#a1a1aa]">Extracting every page...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Upload className="w-10 h-10 text-[#a1a1aa]" />
          <p className="text-[#fafafa] font-medium">Drop PDF documents here</p>
          <p className="text-[#a1a1aa] text-sm">or click to browse</p>
        </div>
      )}
    </div>
  );
};

// Document Card
const DocumentCard = ({ doc, selected, onSelect, onDelete }) => (
  <div data-testid={`doc-card-${doc.id}`} className={`doc-card cursor-pointer ${selected ? 'border-[#F59E0B]' : ''}`} onClick={() => onSelect(doc.id)}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`p-2 rounded ${selected ? 'bg-[#F59E0B]/10' : 'bg-[#1c1c1f]'}`}>
          <FileText className={`w-5 h-5 ${selected ? 'text-[#F59E0B]' : 'text-[#a1a1aa]'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#fafafa] font-medium truncate">{doc.filename}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="mono text-xs text-[#a1a1aa]">{doc.total_pages} pages</span>
            <span className="mono text-xs text-[#a1a1aa]">{doc.total_words?.toLocaleString()} words</span>
          </div>
        </div>
      </div>
      <button data-testid={`delete-doc-${doc.id}`} onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }} className="p-1.5 hover:bg-[#1c1c1f] rounded">
        <Trash2 className="w-4 h-4 text-[#a1a1aa] hover:text-[#EF4444]" />
      </button>
    </div>
  </div>
);

// Live Progress Panel
const LiveProgress = ({ progress, thinking, liveFindings, showPossibleMatches }) => {
  const scrollRef = useRef(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thinking, liveFindings]);

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="doc-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-[#F59E0B] animate-spin" />
            <span className="text-[#fafafa] font-medium">Scanning in Progress</span>
          </div>
          <span className="mono text-sm text-[#F59E0B]">{progress.percent || 0}%</span>
        </div>
        <Progress value={progress.percent || 0} className="h-2 mb-2" />
        <p className="text-sm text-[#a1a1aa]">{progress.status || 'Starting...'}</p>
        {progress.documents && (
          <p className="text-xs text-[#52525b] mt-1">Documents: {progress.documents.join(', ')}</p>
        )}
      </div>

      {/* AI Thinking */}
      {thinking.length > 0 && (
        <div className="doc-card max-h-[200px] overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-[#3B82F6]" />
            <span className="overline">AI Thinking</span>
          </div>
          <ScrollArea ref={scrollRef} className="h-[140px]">
            <div className="space-y-2">
              {thinking.map((t, i) => (
                <div key={i} className="text-sm text-[#a1a1aa] bg-[#09090b] p-2 rounded border-l-2 border-[#3B82F6]">
                  <span className="text-[#3B82F6] mono text-xs">Pages {t.pages}:</span>
                  <p className="mt-1">{t.thought}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Live Findings */}
      {liveFindings.length > 0 && (
        <div className="doc-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              <span className="overline">Findings So Far</span>
            </div>
            <Badge className="bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30">
              {liveFindings.length} found
            </Badge>
          </div>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {liveFindings
                .filter(f => showPossibleMatches || f.match_type !== 'possible')
                .map((f, i) => (
                <div key={i} className="bg-[#09090b] p-3 rounded border-l-2 border-[#F59E0B]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="page-badge">Page {f.page_number}</span>
                    <Badge variant="outline" className="text-xs bg-transparent border-[#27272a] text-[#a1a1aa]">
                      {f.confidence}
                    </Badge>
                  </div>
                  <p className="mono text-sm text-[#fafafa] line-clamp-2">{`"${f.text}"`}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

// Page Coverage Display
const PageCoverage = ({ coverage, pageLog }) => {
  if (!coverage) return null;
  
  return (
    <div className="doc-card">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="w-5 h-5 text-[#3B82F6]" />
        <span className="overline">Page Coverage Verification</span>
      </div>
      
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[#fafafa] mono">{coverage.total_pages}</div>
          <div className="text-xs text-[#a1a1aa] uppercase tracking-wide">Total Pages</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#10B981] mono">{coverage.pages_analyzed}</div>
          <div className="text-xs text-[#a1a1aa] uppercase tracking-wide">Analyzed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#F59E0B] mono">{coverage.pages_with_findings}</div>
          <div className="text-xs text-[#a1a1aa] uppercase tracking-wide">With Matches</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#3B82F6] mono">{coverage.coverage_percent}%</div>
          <div className="text-xs text-[#a1a1aa] uppercase tracking-wide">Coverage</div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-2">
        <CheckCheck className="w-4 h-4 text-[#10B981]" />
        <span className="text-sm text-[#fafafa]">Every page was read and verified</span>
      </div>
      
      {pageLog && pageLog.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#27272a]">
          <div className="text-xs text-[#a1a1aa] mb-2 uppercase tracking-wide">Page-by-Page Status</div>
          <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
            {pageLog.map((p, i) => (
              <div 
                key={i}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs mono font-bold cursor-default
                  ${p.status === 'found' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 
                    p.status === 'empty' ? 'bg-[#52525b]/20 text-[#52525b]' : 
                    'bg-[#27272a] text-[#a1a1aa]'}`}
                title={`Page ${p.page_number}: ${p.status}${p.summary ? ` - ${p.summary}` : ''}`}
              >
                {p.page_number}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-[#F59E0B]/20 rounded"></div> Found matches</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-[#27272a] rounded"></div> No matches</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Finding Card
const FindingCard = ({ finding, index }) => {
  // Handle both legacy and Pro mode field names
  const pageNum = finding.page_number || finding.global_page;
  const text = finding.text || finding.quote;
  const relevance = finding.relevance || finding.why_relevant;
  const section = finding.section;
  
  return (
    <div data-testid={`finding-${index}`} className={`finding-card ${finding.confidence || 'medium'}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="page-badge">Page {pageNum}</span>
        {section && <Badge variant="outline" className="text-xs bg-transparent border-[#3B82F6]/30 text-[#3B82F6]">{section}</Badge>}
        {finding.document && <Badge variant="outline" className="text-xs bg-transparent border-[#27272a] text-[#a1a1aa]">{finding.document}</Badge>}
        {finding.match_type && (
          <Badge
            variant="outline"
            className={`text-xs bg-transparent border-[#27272a] ${finding.match_type === 'possible' ? 'text-[#8B5CF6]' : 'text-[#10B981]'}`}
          >
            {finding.match_type === 'possible' ? 'POSSIBLE' : 'MATCH'}
          </Badge>
        )}
        <Badge className={`text-xs uppercase ${
          finding.confidence === 'high' ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30' :
          finding.confidence === 'low' ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30' :
          'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
        }`}>
          {finding.confidence || 'medium'} confidence
        </Badge>
      </div>
      <blockquote className="mono text-sm text-[#fafafa] bg-[#09090b] p-3 rounded border-l-2 border-[#3B82F6] mb-2 leading-relaxed whitespace-pre-wrap">
        {`"${text}"`}
      </blockquote>
      {relevance && <p className="text-sm text-[#a1a1aa]">{relevance}</p>}
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
    setMessages(prev => [...prev, { role: "user", content: input }]);
    const msg = input;
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(`${API}/chat`, {
        session_id: sessionId,
        document_ids: documents.map(d => d.id),
        message: msg
      });
      if (!sessionId) setSessionId(res.data.session_id);
      setMessages(prev => [...prev, { role: "assistant", content: res.data.response }]);
    } catch (err) {
      toast.error("Chat failed");
      setMessages(prev => prev.slice(0, -1));
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#121214] border border-[#27272a] rounded">
      <div className="p-4 border-b border-[#27272a] glass">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#3B82F6]" />
          <span className="overline">Ask Questions About Your Documents</span>
        </div>
      </div>
      
      <ScrollArea ref={scrollRef} className="flex-1 p-4" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <BookOpen className="w-10 h-10 text-[#27272a] mb-3" />
            <p className="text-[#a1a1aa] text-sm">Ask anything about your documents</p>
            <p className="text-[#52525b] text-xs mt-1">I&apos;ll search every page to find the answer</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            {loading && (
              <div className="chat-bubble assistant flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#3B82F6]" />
                <span className="text-sm text-[#a1a1aa]">Searching documents...</span>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      
      <div className="p-4 border-t border-[#27272a]">
        <div className="flex gap-2">
          <Input
            data-testid="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={documents.length ? "What do you want to find?" : "Select documents first"}
            disabled={!documents.length || loading}
            className="bg-[#09090b] border-[#27272a] focus:border-[#F59E0B] text-[#fafafa] placeholder:text-[#52525b]"
          />
          <Button data-testid="send-message-btn" onClick={sendMessage} disabled={!input.trim() || !documents.length || loading} className="btn-primary px-3">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Main DeepDive Component
const DeepDive = () => {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  
  const [query, setQuery] = useState("");

  // Gemini Pro (native PDF) mode
  const [useProMode, setUseProMode] = useState(true); // Pro-only per requirements
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem(GEMINI_KEY_STORAGE) || "");
  const [proUploading, setProUploading] = useState(false);
  const [proUploadProgress, setProUploadProgress] = useState({ percent: 0, status: '' });
  const [proDocuments, setProDocuments] = useState([]);
  const [selectedProDoc, setSelectedProDoc] = useState(null);
  const [proChatSessionId, setProChatSessionId] = useState(null);
  const [proChatMessages, setProChatMessages] = useState([]);
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [selectedSpeed, setSelectedSpeed] = useState("balanced");
  const [pageRangeEnabled, setPageRangeEnabled] = useState(false);
  
  // Past analyses history
  const [pastAnalyses, setPastAnalyses] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const loadPastAnalyses = async () => {
    try {
      const res = await axios.get(`${API}/pro/analyses`);
      setPastAnalyses((res.data || []).reverse()); // Most recent first
    } catch (e) {
      // ignore
    }
  };
  
  const loadAnalysisById = async (analysisId) => {
    try {
      const res = await axios.get(`${API}/pro/analyses/${analysisId}`);
      setAnalysisResult({
        query: res.data.query,
        pro: true,
        model_used: res.data.model_used,
        result: res.data.result,
        document_name: res.data.document_name,
        created_at: res.data.created_at,
      });
      setActiveTab('results');
      setShowHistory(false);
      toast.success('Loaded past analysis');
    } catch (e) {
      toast.error('Failed to load analysis');
    }
  };
  
  const loadProDocuments = async () => {
    try {
      const res = await axios.get(`${API}/pro/documents`);
      setProDocuments(res.data || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!useProMode) return;
    const t = setTimeout(() => {
      loadProDocuments();
      loadPastAnalyses();
    }, 0);
    return () => clearTimeout(t);
  }, [useProMode]);

  const saveGeminiKey = (key) => {
    setGeminiKey(key);
    localStorage.setItem(GEMINI_KEY_STORAGE, key);
  };

  const uploadPdfPro = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please choose a PDF');
      return;
    }
    if (!geminiKey.trim()) {
      toast.error('Enter your Gemini API key first');
      return;
    }

    setProUploading(true);
    setProUploadProgress({ percent: 1, status: 'Initializing upload...' });

    try {
      const init = await axios.post(`${API}/pro/upload/init`, {
        filename: file.name,
        size_bytes: file.size,
      });
      const uploadId = init.data.upload_id;

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
        const pct = Math.round((offset / file.size) * 60);
        setProUploadProgress({ percent: pct, status: `Uploading... ${pct}%` });
      }

      setProUploadProgress({ percent: 70, status: 'Uploading to Gemini Files API (this can take a bit)...' });
      const complete = await axios.post(`${API}/pro/upload/complete`, {
        upload_id: uploadId,
        gemini_api_key: geminiKey.trim(),
      });

      toast.success(`Pro upload complete: ${complete.data.total_pages} pages`);
      await loadProDocuments();
      setProUploadProgress({ percent: 100, status: 'Ready' });
    } catch (e) {
      toast.error('Pro upload failed');
    }

    setProUploading(false);
  };


  const runProDiagnostics = async () => {
    if (!geminiKey.trim()) {
      toast.error('Enter your Gemini API key first');
      return;
    }
    try {
      const res = await axios.post(`${API}/pro/models`, { gemini_api_key: geminiKey.trim() });
      const pro = res.data?.pro_generateContent_models || [];
      if (pro.length) {
        toast.success(`Available Pro model(s): ${pro.slice(0, 3).join(', ')}`);
      } else {
        toast.error('No Pro models with generateContent found for this key');
      }
    } catch (e) {
      toast.error('Diagnostics failed');
    }
  };

  const runProAnalyze = async () => {
    if (!selectedProDoc) {
      toast.error('Select a Pro document');
      return;
    }
    if (!query.trim()) {
      toast.error('Enter what you want to find');
      return;
    }
    if (!geminiKey.trim()) {
      toast.error('Enter your Gemini API key first');
      return;
    }

    setAnalyzing(true);
    setActiveTab('results');
    setAnalysisResult(null);
    setProgress({});
    setThinking([]);
    setLiveFindings([]);

    try {
      const response = await fetch(`${API}/pro/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_document_id: selectedProDoc,
          query,
          gemini_api_key: geminiKey.trim(),
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

            if (data.type === 'start') {
              const mode = data.batch_mode ? 'multi-part' : 'one-shot';
              setProgress({ 
                percent: 5, 
                status: `Gemini Pro analyzing ${data.total_pages} pages (${mode} mode)...`, 
                documents: [],
                totalBatches: data.parts?.length || 1,
                currentBatch: 0
              });
            }
            if (data.type === 'batch_start') {
              const pct = data.total_batches ? Math.round((data.batch - 1) / data.total_batches * 80) + 10 : 20;
              setProgress(prev => ({ 
                ...prev, 
                percent: pct,
                status: `Processing part ${data.batch}/${data.total_batches || '?'}: pages ${data.pages?.start}-${data.pages?.end}...`,
                currentBatch: data.batch,
                totalBatches: data.total_batches || prev.totalBatches
              }));
            }
            if (data.type === 'batch_done') {
              const pct = data.batch && progress.totalBatches ? Math.round(data.batch / progress.totalBatches * 80) + 10 : 50;
              setProgress(prev => ({ 
                ...prev, 
                percent: Math.min(pct, 90),
                status: `Part ${data.batch} complete. ${prev.totalBatches - data.batch > 0 ? 'Processing next...' : 'Merging results...'}`
              }));
            }
            if (data.type === 'error') {
              toast.error(data.message || 'Pro scan failed');
              setAnalyzing(false);
              return;
            }
            if (data.type === 'done') {
              setProgress(prev => ({ ...prev, percent: 100, status: 'Complete!' }));
              toast.success('Pro scan complete');
              setAnalysisResult({
                query,
                pro: true,
                model_used: data.model_used,
                result: data.result,
              });
              // Auto-switch to Results tab
              setActiveTab('results');
            }
          } catch (parseErr) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (e) {
      toast.error(e?.message || 'Pro scan failed');
    }

    setAnalyzing(false);
  };

  const sendProChat = async (message) => {
    if (!selectedProDoc) { toast.error('Select a Pro document'); return; }
    if (!geminiKey.trim()) { toast.error('Enter your Gemini API key first'); return; }
    if (!message.trim()) return;

    setProChatMessages(prev => [...prev, { role: 'user', content: message }]);

    try {
      const res = await axios.post(`${API}/pro/chat`, {
        session_id: proChatSessionId,
        pro_document_id: selectedProDoc,
        message,
        gemini_api_key: geminiKey.trim(),
      });
      setProChatSessionId(res.data.session_id);
      setProChatMessages(prev => [...prev, { role: 'assistant', content: res.data.answer }]);
    } catch (e) {
      toast.error('Chat failed');
    }
  };

  const [pageRange, setPageRange] = useState({ start: null, end: null });

  // Relevance controls
  const [relevanceMode, setRelevanceMode] = useState("normal"); // normal | strict
  const [rubricText, setRubricText] = useState("");
  const [rubricGeneratedFor, setRubricGeneratedFor] = useState(null); // { query, model }
  const [rubricEditorOpen, setRubricEditorOpen] = useState(false);
  const [showPossibleMatches, setShowPossibleMatches] = useState(false);

  // Live progress state
  const [progress, setProgress] = useState({});
  const [thinking, setThinking] = useState([]);
  const [liveFindings, setLiveFindings] = useState([]);

  const loadDocuments = async () => {
    try {
      const res = await axios.get(`${API}/documents`);
      setDocuments(res.data);
    } catch (err) {
      console.error("Failed to load documents");
    }
  };

  // Initial load (deferred to avoid setState-in-effect lint rule)
  useEffect(() => {
    const t = setTimeout(() => {
      loadDocuments();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggleDoc = (docId) => {
    setSelectedDocs(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
  };

  const deleteDoc = async (docId) => {
    try {
      await axios.delete(`${API}/documents/${docId}`);
      toast.success("Document deleted");
      setSelectedDocs(prev => prev.filter(id => id !== docId));
      loadDocuments();
    } catch (err) {
      toast.error("Delete failed");
    }
  };

  const generateRubric = async () => {
    if (!query.trim()) { toast.error("Enter what you're looking for"); return false; }

    try {
      const res = await axios.post(`${API}/rubric`, { query, model: selectedModel });
      const text = res.data?.rubric_text || "";
      setRubricText(text);
      setRubricGeneratedFor({ query, model: selectedModel });
      setRubricEditorOpen(true);
      toast.success("Rubric generated — review/edit, then start the scan.");
      return true;
    } catch (err) {
      toast.error("Failed to generate rubric");
      return false;
    }
  };

  const startScan = async () => {
    if (!selectedDocs.length) { toast.error("Select documents"); return; }
    if (!query.trim()) { toast.error("Enter what you're looking for"); return; }

    setAnalyzing(true);
    setActiveTab("results");
    setAnalysisResult(null);
    setProgress({});
    setThinking([]);
    setLiveFindings([]);

    try {
      const response = await fetch(`${API}/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          document_ids: selectedDocs, 
          query, 
          model: selectedModel, 
          speed: selectedSpeed,
          page_start: pageRangeEnabled ? pageRange.start : null,
          page_end: pageRangeEnabled ? pageRange.end : null,
          relevance_mode: relevanceMode,
          rubric_text: rubricText || null,
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
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'start':
                  setProgress({ 
                    percent: 0, 
                    status: `Starting analysis of ${data.total_pages} pages...`,
                    documents: data.documents 
                  });
                  if (data.rubric_text) {
                    setRubricText(data.rubric_text);
                  }
                  if (data.relevance_mode) {
                    setRelevanceMode(data.relevance_mode);
                  }
                  break;
                case 'document_start':
                  setProgress(prev => ({ 
                    ...prev, 
                    status: `Analyzing ${data.document} (${data.pages} pages)...` 
                  }));
                  break;
                case 'progress':
                  setProgress({
                    percent: data.percent,
                    status: data.status,
                    batch: data.batch,
                    totalBatches: data.total_batches
                  });
                  break;
                case 'thinking':
                  setThinking(prev => [...prev, { pages: data.pages, thought: data.thought }]);
                  break;
                case 'finding':
                  setLiveFindings(prev => [...prev, data.finding]);
                  break;
                case 'error':
                  toast.error(data.message);
                  break;
                case 'done':
                  toast.success(`Complete! ${data.total_findings} findings across ${data.coverage.pages_analyzed} pages`);
                  // Fetch full analysis
                  const fullAnalysis = await axios.get(`${API}/analyses/${data.analysis_id}`);
                  setAnalysisResult(fullAnalysis.data);
                  break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      toast.error("Analysis failed: " + err.message);
    }

    setAnalyzing(false);
  };


  // Legacy runner kept for compatibility; prefer rubric-driven flow.
  const runAnalysis = async () => {
    // Pro-only per requirements
    await runProAnalyze();
  };

  const selectedDocuments = documents.filter(d => selectedDocs.includes(d.id));
  const totalPages = selectedDocuments.reduce((sum, d) => sum + (d.total_pages || 0), 0);
  const totalWords = selectedDocuments.reduce((sum, d) => sum + (d.total_words || 0), 0);
  const effectivePages = pageRangeEnabled && pageRange.end 
    ? Math.min((pageRange.end || totalPages) - (pageRange.start || 1) + 1, totalPages)
    : totalPages;

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Toaster position="top-right" toastOptions={{ style: { background: '#121214', color: '#fafafa', border: '1px solid #27272a' } }} />
      <header className="glass sticky top-0 z-50 px-6 py-4">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F59E0B]/10 rounded">
              <FileSearch className="w-6 h-6 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#fafafa] tracking-tight">Document Deep Scanner</h1>
              <p className="text-xs text-[#a1a1aa]">Finds what other AI misses</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {selectedDocs.length > 0 && (
              <div className="text-sm text-[#a1a1aa]">
                <span className="text-[#F59E0B] font-bold">{selectedDocs.length}</span> doc{selectedDocs.length !== 1 ? 's' : ''} · 
                <span className="mono ml-1">{totalPages}</span> pages · 
                <span className="mono ml-1">{totalWords.toLocaleString()}</span> words
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left Panel */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <DocumentUpload onUploadSuccess={loadDocuments} />
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="overline">Your Documents</span>
                <span className="mono text-xs text-[#a1a1aa]">{documents.length} files</span>
              </div>
              
              {documents.length === 0 ? (
                <div className="doc-card text-center py-8">
                  <FileText className="w-8 h-8 text-[#27272a] mx-auto mb-2" />
                  <p className="text-[#a1a1aa] text-sm">No documents uploaded</p>
                </div>
              ) : (
                <div className="space-y-2" data-testid="documents-list">
                  {documents.map(doc => (
                    <DocumentCard key={doc.id} doc={doc} selected={selectedDocs.includes(doc.id)} onSelect={toggleDoc} onDelete={deleteDoc} />
                  ))}
                </div>
              )}
            </div>
            
            {/* AI Model Selector */}
            <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
            
            {/* Speed Selector */}
            <SpeedSelector selectedSpeed={selectedSpeed} onSpeedChange={setSelectedSpeed} totalPages={effectivePages} />
            
            {/* Page Range Selector */}
            <PageRangeSelector 
              pageRange={pageRange} 
              onPageRangeChange={setPageRange}
              totalPages={totalPages}
              enabled={pageRangeEnabled}
              onEnabledChange={setPageRangeEnabled}
            />
            
            {/* Search Query */}
            <div className="doc-card">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-[#F59E0B]" />
                <span className="overline">What are you looking for?</span>
              </div>
              <Textarea
                data-testid="query-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-[#09090b] border border-[#27272a] rounded p-3 text-sm text-[#fafafa] focus:border-[#F59E0B] focus:outline-none resize-none leading-relaxed min-h-[100px]"
                placeholder="Describe what information you need to find. Be specific - the AI will search every word on every page."
              />
              <p className="text-xs text-[#52525b] mt-2">Tip: Be specific about what you're looking for.</p>
              
              <Button 
                data-testid="scan-btn-main"
                onClick={runAnalysis} 
                disabled={analyzing || !query.trim() || (useProMode ? !selectedProDoc : !selectedDocs.length)}
                className="w-full mt-4 bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-black font-bold py-3 text-sm uppercase tracking-wide"
              >
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning...</>
                ) : (
                  <><Zap className="w-4 h-4 mr-2" /> Gemini Pro Deep Scan</>
                )}
              </Button>
              
            {/* Relevance & Rubric */}
            <div className="doc-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-[#3B82F6]" />
                  <span className="overline">Relevance</span>
                </div>
                <button
                  onClick={() => setRubricEditorOpen(true)}
                  className="text-xs px-2 py-1 rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa]"
                >
                  View/Edit Rubric
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs text-[#a1a1aa]">Strict mode</Label>
                  <p className="text-[11px] text-[#52525b] mt-1">Fewer results, higher precision. Borderline items become "Possible".</p>
                </div>
                <Switch
                  checked={relevanceMode === 'strict'}
                  onCheckedChange={(v) => setRelevanceMode(v ? 'strict' : 'normal')}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs text-[#a1a1aa]">Show possible matches</Label>
                  <p className="text-[11px] text-[#52525b] mt-1">Include borderline results that might be relevant.</p>
                </div>
                <Switch
                  checked={showPossibleMatches}
                  onCheckedChange={(v) => setShowPossibleMatches(!!v)}
                />
              </div>

              <div className="mt-3 p-3 bg-[#09090b] rounded border border-[#27272a]">
                <div className="text-xs text-[#52525b] uppercase tracking-wide mb-1">Rubric preview</div>
                <p className="text-sm text-[#a1a1aa] whitespace-pre-wrap line-clamp-6">{rubricText?.trim() ? rubricText : "No rubric yet. Click Generate Rubric."}</p>
              </div>
            </div>

              {!selectedDocs.length && (
                <p className="text-xs text-[#EF4444] mt-2 text-center">Select documents above first</p>
              )}

            {/* Gemini Pro Mode */}
            <div className="doc-card" data-testid="gemini-pro-mode">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-[#3B82F6]" />
                  <span className="overline">Gemini Pro (Pro-only)</span>
                </div>
              </div>
              <p className="text-xs text-[#a1a1aa]">
                Native PDF reading + huge context. This app runs Gemini Pro only (no Flash, no page-batched scan).
              </p>

              <div className="mt-3 space-y-3">
                  <div>
                    <Label className="text-xs text-[#a1a1aa]">Gemini API Key</Label>
                    <Input
                      value={geminiKey}
                      onChange={(e) => saveGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      className="bg-[#09090b] border-[#27272a] text-[#fafafa] text-sm h-9 mt-1"
                    />
                    <p className="text-[11px] text-[#52525b] mt-1">
                      Stored in your browser only. Needed for Gemini Files API + Pro model calls.
                    </p>
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="bg-transparent border-[#27272a] text-[#a1a1aa] hover:bg-[#1c1c1f] hover:text-[#fafafa] h-8 text-xs"
                        onClick={runProDiagnostics}
                      >
                        Diagnostics: List available Pro models
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-[#a1a1aa]">Upload PDF (Pro)</Label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => e.target.files?.[0] && uploadPdfPro(e.target.files[0])}
                      className="mt-2 block w-full text-xs text-[#a1a1aa]"
                    />
                    {proUploading && (
                      <div className="mt-2">
                        <Progress value={proUploadProgress.percent} className="h-2" />
                        <p className="text-xs text-[#a1a1aa] mt-1">{proUploadProgress.status}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs text-[#a1a1aa]">Pro Document</Label>
                    <Select value={selectedProDoc || ''} onValueChange={(v) => { setSelectedProDoc(v); setProChatSessionId(null); setProChatMessages([]); }}>
                      <SelectTrigger className="w-full bg-[#09090b] border-[#27272a] text-[#fafafa] h-9 mt-1">
                        <SelectValue placeholder="Select uploaded Pro PDF" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121214] border-[#27272a]">
                        {proDocuments.map(d => (
                          <SelectItem key={d.id} value={d.id} className="text-[#fafafa] focus:bg-[#1c1c1f] focus:text-[#fafafa] cursor-pointer">
                            {d.filename} ({d.total_pages} pages)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-[#52525b] mt-1">Approx cost: ~$2.00 per 500 pages (rough estimate). Large documents may trigger Batch Mode.</p>
                  </div>

                  <Button
                    onClick={runProAnalyze}
                    disabled={analyzing || !selectedProDoc || !query.trim()}
                    className="w-full bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white font-bold py-2 text-sm"
                  >
                    {analyzing ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" /> Pro Scanning...</>) : 'Run Gemini Pro Deep Scan'}
                  </Button>
                </div>
            </div>


              {selectedDocs.length > 0 && !query.trim() && (
                <p className="text-xs text-[#EF4444] mt-2 text-center">Enter what you're looking for</p>
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="col-span-12 lg:col-span-8">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-[#121214] border border-[#27272a] p-1 mb-4">
                <TabsTrigger value="home" className="data-[state=active]:bg-[#1c1c1f] data-[state=active]:text-[#fafafa] text-[#a1a1aa]">
                  <Eye className="w-4 h-4 mr-2" />Overview
                </TabsTrigger>
                <TabsTrigger value="results" className="data-[state=active]:bg-[#1c1c1f] data-[state=active]:text-[#fafafa] text-[#a1a1aa]">
                  <FileText className="w-4 h-4 mr-2" />Results
                </TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-[#1c1c1f] data-[state=active]:text-[#fafafa] text-[#a1a1aa]">
                  <Clock className="w-4 h-4 mr-2" />History
                </TabsTrigger>
                <TabsTrigger value="chat" className="data-[state=active]:bg-[#1c1c1f] data-[state=active]:text-[#fafafa] text-[#a1a1aa]">
                  <MessageSquare className="w-4 h-4 mr-2" />Chat
                </TabsTrigger>
              </TabsList>

              <TabsContent value="home" className="mt-0">
                <div className="doc-card relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-6">
                    <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
                    <h3 className="text-lg font-bold text-[#fafafa]">Why Other AI Tools Miss Things</h3>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    <p className="text-[#a1a1aa]">Most AI tools <span className="text-[#EF4444]">skim</span> documents or only read <span className="text-[#EF4444]">summaries</span>. They don't verify they've actually read every page.</p>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCheck className="w-5 h-5 text-[#10B981]" />
                    <h3 className="text-lg font-bold text-[#fafafa]">How Deep Scanner Works</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-[#F59E0B]/10 rounded text-[#F59E0B] mono text-sm font-bold min-w-[36px] text-center">01</div>
                      <div>
                        <p className="text-[#fafafa] font-medium">Upload any PDF documents</p>
                        <p className="text-[#a1a1aa] text-sm">Every page is extracted and indexed with word counts</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-[#F59E0B]/10 rounded text-[#F59E0B] mono text-sm font-bold min-w-[36px] text-center">02</div>
                      <div>
                        <p className="text-[#fafafa] font-medium">Describe what you're looking for</p>
                        <p className="text-[#a1a1aa] text-sm">Any type of information - clauses, names, dates, requirements</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-[#F59E0B]/10 rounded text-[#F59E0B] mono text-sm font-bold min-w-[36px] text-center">03</div>
                      <div>
                        <p className="text-[#fafafa] font-medium">Watch AI analyze in real-time</p>
                        <p className="text-[#a1a1aa] text-sm">See progress, thinking process, and findings as they happen</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-[#F59E0B]/10 rounded text-[#F59E0B] mono text-sm font-bold min-w-[36px] text-center">04</div>
                      <div>
                        <p className="text-[#fafafa] font-medium">Get verified results with page coverage proof</p>
                        <p className="text-[#a1a1aa] text-sm">See exactly which pages were read and where findings came from</p>
            {/* Rubric editor dialog */}
            <Dialog open={rubricEditorOpen} onOpenChange={setRubricEditorOpen}>
              <DialogContent className="bg-[#121214] border border-[#27272a] text-[#fafafa] max-w-[900px]">
                <DialogHeader>
                  <DialogTitle className="text-[#fafafa]">Relevance Rubric (auto-generated, editable)</DialogTitle>
                </DialogHeader>

                <div className="space-y-2">
                  <p className="text-sm text-[#a1a1aa]">
                    This rubric controls what counts as a true match. The scanner will only return findings that include direct quotes.
                  </p>
                  <Textarea
                    value={rubricText}
                    onChange={(e) => setRubricText(e.target.value)}
                    className="w-full bg-[#09090b] border border-[#27272a] rounded p-3 text-sm text-[#fafafa] focus:border-[#F59E0B] focus:outline-none resize-none leading-relaxed min-h-[240px]"
                    placeholder="Rubric will appear here..."
                  />
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    className="bg-transparent border-[#27272a] text-[#a1a1aa] hover:bg-[#1c1c1f] hover:text-[#fafafa]"
                    onClick={() => setRubricEditorOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    className="bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-black font-bold"
                    onClick={async () => {
                      setRubricGeneratedFor({ query, model: selectedModel });
                      setRubricEditorOpen(false);
                      await startScan();
                    }}
                    disabled={analyzing || !selectedDocs.length || !query.trim()}
                  >
                    Start Scan With This Rubric
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="results" className="mt-0">
                {analyzing ? (
                  <LiveProgress progress={progress} thinking={thinking} liveFindings={liveFindings} showPossibleMatches={showPossibleMatches} />
                ) : analysisResult ? (
                  <div className="space-y-4">
                    {/* Pro Mode Results Header */}
                    {analysisResult.pro && analysisResult.result && (
                      <div className="doc-card">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-5 h-5 text-[#3B82F6]" />
                          <span className="text-[#fafafa] font-medium">Gemini Pro Analysis Complete</span>
                          <Badge className="bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/30 text-xs">
                            {analysisResult.model_used}
                          </Badge>
                        </div>
                        {analysisResult.result.doc_type && (
                          <p className="text-sm text-[#a1a1aa] mb-2">
                            <span className="text-[#52525b]">Document Type:</span> {analysisResult.result.doc_type}
                          </p>
                        )}
                        {analysisResult.result.notes && (
                          <p className="text-sm text-[#a1a1aa] bg-[#09090b] p-3 rounded border-l-2 border-[#F59E0B]">
                            <span className="text-[#F59E0B] font-medium">Notes:</span> {analysisResult.result.notes}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Legacy Page Coverage */}
                    {!analysisResult.pro && <PageCoverage coverage={analysisResult.page_coverage} pageLog={analysisResult.page_log} />}
                    
                    {/* Findings */}
                    {(() => {
                      const findings = analysisResult.findings || analysisResult.result?.findings || [];
                      return findings.length > 0 ? (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="overline">Findings ({findings.length})</span>
                            <span className="text-xs text-[#a1a1aa]">Query: {analysisResult.query}</span>
                          </div>
                          <div className="space-y-3" data-testid="findings-list">
                            {findings
                              .filter(f => showPossibleMatches || f.match_type !== 'possible')
                              .map((f, i) => <FindingCard key={i} finding={f} index={i} />)}
                          </div>
                        </div>
                      ) : (
                        <div className="doc-card text-center py-8">
                          <Search className="w-10 h-10 text-[#27272a] mx-auto mb-3" />
                          <p className="text-[#fafafa] font-medium">No matches found</p>
                          <p className="text-[#a1a1aa] text-sm mt-1">The document was searched but no relevant content was found for your query.</p>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="doc-card flex flex-col items-center justify-center py-16">
                    <Search className="w-12 h-12 text-[#27272a] mb-4" />
                    <p className="text-[#a1a1aa]">Select documents, enter your query, and click Deep Scan</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-[#3B82F6]" />
                      <span className="overline">Past Queries ({pastAnalyses.length})</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={loadPastAnalyses}
                      className="text-xs"
                    >
                      Refresh
                    </Button>
                  </div>
                  
                  {pastAnalyses.length > 0 ? (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {pastAnalyses.map((analysis) => (
                        <div 
                          key={analysis.id} 
                          className="doc-card cursor-pointer hover:border-[#3B82F6]/50 transition-colors"
                          onClick={() => loadAnalysisById(analysis.id)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={`text-xs ${
                                  analysis.status === 'complete' 
                                    ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30' 
                                    : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                                }`}>
                                  {analysis.status}
                                </Badge>
                                <span className="text-xs text-[#52525b]">
                                  {new Date(analysis.created_at).toLocaleDateString()} {new Date(analysis.created_at).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm text-[#fafafa] font-medium truncate mb-1">
                                {analysis.document_name}
                              </p>
                              <p className="text-sm text-[#a1a1aa] line-clamp-2">
                                {analysis.query}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs bg-transparent border-[#27272a] text-[#71717a]">
                                  {analysis.model_used || 'gemini-pro'}
                                </Badge>
                                {analysis.result?.findings && (
                                  <span className="text-xs text-[#3B82F6]">
                                    {analysis.result.findings.length} findings
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-[#3B82F6]">
                              View
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="doc-card flex flex-col items-center justify-center py-16">
                      <History className="w-12 h-12 text-[#27272a] mb-4" />
                      <p className="text-[#a1a1aa]">No past queries yet</p>
                      <p className="text-[#52525b] text-sm mt-1">Run a scan to see your history here</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="chat" className="mt-0 h-[600px]">
                <ChatPanel documents={selectedDocuments} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DeepDive;
